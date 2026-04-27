create or replace function public.is_epsu_host(target_epsu_id uuid, target_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(target_profile_id) or exists(
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = target_epsu_id
      and membership.profile_id = target_profile_id
      and membership.role = 'host'
      and membership.status = 'active'
  ) or exists(
    select 1
    from public.epsus epsu
    where epsu.id = target_epsu_id
      and epsu.host_id = target_profile_id
  );
$$;

create or replace function public.is_epsu_moderator(target_epsu_id uuid, target_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(target_profile_id) or exists(
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = target_epsu_id
      and membership.profile_id = target_profile_id
      and membership.role in ('host', 'moderator')
      and membership.status = 'active'
  ) or exists(
    select 1
    from public.epsus epsu
    where epsu.id = target_epsu_id
      and epsu.host_id = target_profile_id
  );
$$;
