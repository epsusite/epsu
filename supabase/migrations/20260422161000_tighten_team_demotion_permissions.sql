create or replace function public.set_epsu_membership_role(p_membership_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_record public.epsu_memberships%rowtype;
  previous_role text;
  actor_is_admin boolean;
  actor_is_host boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_role not in ('member', 'moderator') then
    raise exception 'Invalid membership role';
  end if;

  select *
  into membership_record
  from public.epsu_memberships
  where id = p_membership_id;

  if not found then
    raise exception 'Membership not found';
  end if;

  actor_is_admin := public.is_platform_admin();
  actor_is_host := public.is_epsu_host(membership_record.epsu_id);

  if not actor_is_admin and not actor_is_host then
    raise exception 'Host or admin access required';
  end if;

  if membership_record.profile_id = auth.uid() then
    raise exception 'You cannot change your own role here';
  end if;

  if membership_record.role = 'host' then
    if not actor_is_admin then
      raise exception 'Only admins can demote hosts';
    end if;

    if p_role <> 'moderator' then
      raise exception 'Hosts can only be demoted to moderator';
    end if;
  elsif membership_record.role = 'moderator' then
    if p_role <> 'member' then
      raise exception 'Moderators can only be demoted to member';
    end if;
  else
    raise exception 'Only hosts and moderators can be changed here';
  end if;

  previous_role := membership_record.role;

  update public.epsu_memberships
  set role = p_role
  where id = p_membership_id;

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, action_type, details)
  values (
    auth.uid(),
    membership_record.profile_id,
    membership_record.epsu_id,
    'change_member_role',
    jsonb_build_object('from_role', previous_role, 'to_role', p_role, 'membership_id', p_membership_id)
  );

  return jsonb_build_object('ok', true);
end;
$$;
