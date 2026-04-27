create or replace function public.join_all_public_epsus()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status)
  select epsu.id, auth.uid(), 'member', 'active'
  from public.epsus epsu
  where epsu.scope <> 'private'
  on conflict (epsu_id, profile_id)
  do update set
    status = case
      when public.epsu_memberships.status = 'left' then 'active'
      else public.epsu_memberships.status
    end;
end;
$$;

grant execute on function public.join_all_public_epsus() to authenticated;
