create or replace function public.fetch_guest_epsus(p_country_code text default null)
returns table (
  id uuid,
  slug text,
  name text,
  code text,
  scope text,
  website text,
  review_status text,
  country_code text,
  logo_path text,
  is_trial boolean,
  trial_member_goal integer,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  member_count bigint,
  online_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with preferences as (
    select nullif(upper(trim(coalesce(p_country_code, ''))), '') as preferred_country_code
  ),
  visible_epsus as (
    select
      epsu.id,
      epsu.slug,
      epsu.name,
      epsu.code,
      epsu.scope,
      epsu.website,
      epsu.review_status,
      epsu.country_code,
      epsu.logo_path,
      epsu.is_trial,
      epsu.trial_member_goal,
      epsu.trial_started_at,
      epsu.trial_ends_at
    from public.epsus epsu
    where epsu.review_status = 'approved'
      and epsu.scope in ('country', 'state', 'city', 'school')
  ),
  member_profiles as (
    select membership.epsu_id, membership.profile_id
    from public.epsu_memberships membership
    where membership.status = 'active'
      and membership.epsu_id in (select epsu.id from visible_epsus epsu)
    union
    select epsu.id as epsu_id, epsu.host_id as profile_id
    from public.epsus epsu
    where epsu.host_id is not null
      and epsu.id in (select visible.id from visible_epsus visible)
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
    where presence.epsu_id in (select epsu.id from visible_epsus epsu)
    group by presence.epsu_id
  )
  select
    epsu.id,
    epsu.slug,
    epsu.name,
    epsu.code,
    epsu.scope,
    epsu.website,
    epsu.review_status,
    epsu.country_code,
    epsu.logo_path,
    epsu.is_trial,
    epsu.trial_member_goal,
    epsu.trial_started_at,
    epsu.trial_ends_at,
    coalesce(member_counts.member_count, 0)::bigint as member_count,
    coalesce(online_counts.online_count, 0)::bigint as online_count
  from visible_epsus epsu
  cross join preferences
  left join member_counts on member_counts.epsu_id = epsu.id
  left join online_counts on online_counts.epsu_id = epsu.id
  order by
    case
      when preferences.preferred_country_code is not null and epsu.country_code = preferences.preferred_country_code then 0
      else 1
    end asc,
    coalesce(member_counts.member_count, 0) desc,
    epsu.name asc;
$$;

grant execute on function public.fetch_guest_epsus(text) to anon;
grant execute on function public.fetch_guest_epsus(text) to authenticated;
