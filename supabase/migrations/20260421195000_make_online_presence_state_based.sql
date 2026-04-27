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
    select unnest(coalesce(p_epsu_ids, '{}'::uuid[])) as epsu_id
  ),
  visible_epsus as (
    select requested_id as epsu_id
    from requested_epsus requested
    cross join lateral (select requested.epsu_id as requested_id) ids
    where exists (
      select 1
      from public.epsus epsu
      where epsu.id = requested_id
        and (
          epsu.scope = 'school'
          or public.can_view_epsu_feed(requested_id)
        )
    )
  ),
  member_profiles as (
    select membership.epsu_id, membership.profile_id
    from public.epsu_memberships membership
    where membership.status = 'active'
      and membership.epsu_id in (select epsu_id from visible_epsus)
    union
    select epsu.id as epsu_id, epsu.host_id as profile_id
    from public.epsus epsu
    where epsu.host_id is not null
      and epsu.id in (select epsu_id from visible_epsus)
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
    where presence.epsu_id in (select epsu_id from visible_epsus)
    group by presence.epsu_id
  )
  select
    visible_epsus.epsu_id,
    coalesce(member_counts.member_count, 0)::bigint as member_count,
    coalesce(online_counts.online_count, 0)::bigint as online_count
  from visible_epsus
  left join member_counts on member_counts.epsu_id = visible_epsus.epsu_id
  left join online_counts on online_counts.epsu_id = visible_epsus.epsu_id;
$$;
