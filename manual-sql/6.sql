create or replace function public.kick_school_epsu_member(p_epsu_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_epsu
  from public.epsus
  where id = p_epsu_id;

  if not found or target_epsu.scope <> 'school' then
    raise exception 'Only school Epsus support owner kicks';
  end if;

  if not public.is_epsu_owner(p_epsu_id) then
    raise exception 'Owner access required';
  end if;

  if exists (
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = p_epsu_id
      and membership.profile_id = p_profile_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise exception 'Owners cannot be kicked';
  end if;

  update public.epsu_memberships
  set status = 'kicked',
      muted_until = null
  where epsu_id = p_epsu_id
    and profile_id = p_profile_id;

  update public.epsu_join_applications
  set status = 'rejected',
      reviewed_by_profile_id = auth.uid(),
      reviewed_at = timezone('utc', now())
  where epsu_id = p_epsu_id
    and profile_id = p_profile_id
    and status = 'pending';

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.kick_school_epsu_member(uuid, uuid) to authenticated;
