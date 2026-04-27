create or replace function public.count_school_epsu_memberships(
  p_profile_id uuid default auth.uid(),
  p_excluded_epsu_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_platform_admin(p_profile_id) then 0
    else (
      select count(*)
      from public.epsu_memberships membership
      join public.epsus epsu on epsu.id = membership.epsu_id
      where membership.profile_id = p_profile_id
        and membership.status in ('active', 'muted', 'invited')
        and epsu.scope = 'school'
        and (p_excluded_epsu_id is null or membership.epsu_id <> p_excluded_epsu_id)
    )::integer
  end;
$$;

create or replace function public.count_regional_epsu_memberships(
  p_profile_id uuid default auth.uid(),
  p_excluded_epsu_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_platform_admin(p_profile_id) then 0
    else (
      select count(*)
      from public.epsu_memberships membership
      join public.epsus epsu on epsu.id = membership.epsu_id
      where membership.profile_id = p_profile_id
        and membership.status in ('active', 'muted', 'invited')
        and epsu.scope <> 'school'
        and epsu.scope <> 'private'
        and (p_excluded_epsu_id is null or membership.epsu_id <> p_excluded_epsu_id)
    )::integer
  end;
$$;
