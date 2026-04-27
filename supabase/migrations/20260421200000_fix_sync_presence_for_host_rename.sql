create or replace function public.sync_epsu_presence(p_epsu_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_epsu_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(array_agg(distinct accessible_epsus.epsu_id), '{}')
  into active_epsu_ids
  from (
    select membership.epsu_id
    from public.epsu_memberships membership
    where membership.profile_id = auth.uid()
      and membership.status = 'active'
      and (
        p_epsu_ids is null
        or cardinality(p_epsu_ids) = 0
        or membership.epsu_id = any(p_epsu_ids)
      )
    union
    select epsu.id as epsu_id
    from public.epsus epsu
    where epsu.host_id = auth.uid()
      and (
        p_epsu_ids is null
        or cardinality(p_epsu_ids) = 0
        or epsu.id = any(p_epsu_ids)
      )
  ) accessible_epsus;

  delete from public.epsu_presence
  where profile_id = auth.uid()
    and not (epsu_id = any(active_epsu_ids));

  insert into public.epsu_presence (epsu_id, profile_id, last_seen_at)
  select epsu_id, auth.uid(), timezone('utc', now())
  from unnest(active_epsu_ids) as epsu_id
  on conflict (epsu_id, profile_id)
  do update set last_seen_at = excluded.last_seen_at;
end;
$$;
