create or replace function public.fetch_muted_epsu_member_ids(p_epsu_id uuid)
returns table (
  profile_id uuid
)
language sql
security definer
set search_path = public
as $$
  select membership.profile_id
  from public.epsu_memberships membership
  where membership.epsu_id = p_epsu_id
    and membership.status = 'muted'
    and (
      membership.muted_until is null
      or membership.muted_until > timezone('utc', now())
    )
    and public.has_epsu_capability(p_epsu_id, 'moderate');
$$;

grant execute on function public.fetch_muted_epsu_member_ids(uuid) to authenticated;
