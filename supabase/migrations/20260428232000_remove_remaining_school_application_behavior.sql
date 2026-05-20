update public.epsu_memberships
set status = 'active'
where status = 'invited';

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
    raise exception 'Only school Epsus support host kicks';
  end if;

  if not public.is_epsu_host(p_epsu_id) then
    raise exception 'Host access required';
  end if;

  if exists (
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = p_epsu_id
      and membership.profile_id = p_profile_id
      and membership.role = 'host'
      and membership.status = 'active'
  ) then
    raise exception 'Hosts cannot be kicked';
  end if;

  update public.epsu_memberships
  set status = 'kicked',
      muted_until = null
  where epsu_id = p_epsu_id
    and profile_id = p_profile_id;

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, action_type, details)
  values (
    auth.uid(),
    p_profile_id,
    p_epsu_id,
    'kick_school_member',
    jsonb_build_object('status', 'kicked')
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.redeem_epsu_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record public.epsu_invites%rowtype;
  target_epsu public.epsus%rowtype;
  next_role text;
  next_status text;
  next_use_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into invite_record
  from public.epsu_invites
  where token = nullif(trim(p_token), '')
  for update;

  if not found or not invite_record.is_active or invite_record.use_count >= invite_record.max_uses then
    return jsonb_build_object(
      'ok', false,
      'message', 'This invite is no longer valid'
    );
  end if;

  select *
  into target_epsu
  from public.epsus
  where id = invite_record.epsu_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'This invite is no longer valid'
    );
  end if;

  if target_epsu.scope = 'school' and public.count_school_epsu_memberships(auth.uid(), target_epsu.id) >= 3 then
    return jsonb_build_object(
      'ok', false,
      'message', 'You can only be in three school Epsus at once'
    );
  end if;

  if target_epsu.scope <> 'school' and target_epsu.scope <> 'private' and public.count_regional_epsu_memberships(auth.uid(), target_epsu.id) >= 1 then
    return jsonb_build_object(
      'ok', false,
      'message', 'You can only have one regional Epsu at a time'
    );
  end if;

  next_role := case when invite_record.invite_role = 'moderator' then 'moderator' else 'member' end;
  next_status := 'active';

  insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
  values (invite_record.epsu_id, auth.uid(), next_role, next_status, null)
  on conflict (epsu_id, profile_id)
  do update set
    role = excluded.role,
    status = excluded.status,
    muted_until = null
  where public.epsu_memberships.role <> 'host';

  next_use_count := invite_record.use_count + 1;

  update public.epsu_invites
  set
    use_count = next_use_count,
    is_active = next_use_count < invite_record.max_uses
  where id = invite_record.id;

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, action_type, details)
  values (
    invite_record.created_by_profile_id,
    auth.uid(),
    invite_record.epsu_id,
    'redeem_invite',
    jsonb_build_object('invite_role', invite_record.invite_role, 'membership_status', next_status)
  );

  return jsonb_build_object(
    'ok', true,
    'epsuId', invite_record.epsu_id,
    'role', next_role,
    'status', next_status,
    'message', case
      when next_role = 'moderator' then 'Moderator access granted'
      else 'You joined successfully'
    end
  );
end;
$$;

create or replace function public.delete_own_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if exists (
    select 1
    from public.epsus epsu
    where epsu.host_id = current_user_id
  ) then
    raise exception 'Delete or transfer your hosted Epsus before deleting this account.';
  end if;

  delete from public.app_notifications where profile_id = current_user_id;
  delete from public.post_reactions where profile_id = current_user_id;
  delete from public.post_reports where profile_id = current_user_id;
  delete from public.epsu_subscriptions where profile_id = current_user_id;
  delete from public.epsu_memberships where profile_id = current_user_id;
  delete from public.epsu_suggestions where profile_id = current_user_id;

  delete from auth.users
  where id = current_user_id;

  return jsonb_build_object('ok', true);
end;
$$;
