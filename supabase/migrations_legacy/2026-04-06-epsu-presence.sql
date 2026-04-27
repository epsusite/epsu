create table if not exists public.epsu_presence (
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default timezone('utc', now()),
  primary key (epsu_id, profile_id)
);

create index if not exists idx_epsu_presence_last_seen_at
on public.epsu_presence (last_seen_at desc);

alter table public.epsu_presence enable row level security;

drop policy if exists epsu_presence_select_visible on public.epsu_presence;
create policy epsu_presence_select_visible
on public.epsu_presence
for select
to authenticated
using (public.can_access_epsu(epsu_id));

drop policy if exists epsu_presence_insert_self on public.epsu_presence;
create policy epsu_presence_insert_self
on public.epsu_presence
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and public.is_epsu_member(epsu_id)
);

drop policy if exists epsu_presence_update_self on public.epsu_presence;
create policy epsu_presence_update_self
on public.epsu_presence
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists epsu_presence_delete_self on public.epsu_presence;
create policy epsu_presence_delete_self
on public.epsu_presence
for delete
to authenticated
using (profile_id = auth.uid());

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
    where epsu.owner_id = auth.uid()
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

create or replace function public.clear_epsu_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  delete from public.epsu_presence
  where profile_id = auth.uid();
end;
$$;

create or replace function public.fetch_epsu_population_counts(p_epsu_ids uuid[])
returns table (
  epsu_id uuid,
  member_count bigint,
  online_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with requested_epsus as (
    select distinct requested_id as epsu_id
    from unnest(coalesce(p_epsu_ids, '{}')) as requested_id
    where public.can_access_epsu(requested_id)
  ),
  member_profiles as (
    select membership.epsu_id, membership.profile_id
    from public.epsu_memberships membership
    where membership.status = 'active'
      and membership.epsu_id in (select epsu_id from requested_epsus)
    union
    select epsu.id as epsu_id, epsu.owner_id as profile_id
    from public.epsus epsu
    where epsu.owner_id is not null
      and epsu.id in (select epsu_id from requested_epsus)
  ),
  member_counts as (
    select
      member_profiles.epsu_id,
      count(*)::bigint as member_count
    from member_profiles
    group by member_profiles.epsu_id
  ),
  online_counts as (
    select
      presence.epsu_id,
      count(*)::bigint as online_count
    from public.epsu_presence presence
    where presence.last_seen_at >= timezone('utc', now()) - interval '90 seconds'
      and presence.epsu_id in (select epsu_id from requested_epsus)
    group by presence.epsu_id
  )
  select
    requested_epsus.epsu_id,
    coalesce(member_counts.member_count, 0) as member_count,
    coalesce(online_counts.online_count, 0) as online_count
  from requested_epsus
  left join member_counts on member_counts.epsu_id = requested_epsus.epsu_id
  left join online_counts on online_counts.epsu_id = requested_epsus.epsu_id;
$$;

grant execute on function public.sync_epsu_presence(uuid[]) to authenticated;
grant execute on function public.clear_epsu_presence() to authenticated;
grant execute on function public.fetch_epsu_population_counts(uuid[]) to authenticated;
