create or replace function public.can_view_epsu_feed(
  target_epsu_id uuid,
  target_profile_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(target_profile_id)
    or exists (
      select 1
      from public.epsu_memberships membership
      where membership.epsu_id = target_epsu_id
        and membership.profile_id = target_profile_id
        and membership.status in ('active', 'muted')
    )
    or exists (
      select 1
      from public.epsus epsu
      where epsu.id = target_epsu_id
        and epsu.host_id = target_profile_id
    );
$$;

grant execute on function public.can_view_epsu_feed(uuid, uuid) to authenticated;
