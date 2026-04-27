alter table public.moderation_actions
add column if not exists details jsonb not null default '{}'::jsonb;

alter table public.moderation_actions
drop constraint if exists moderation_actions_action_type_check;

alter table public.moderation_actions
add constraint moderation_actions_action_type_check
check (
  action_type in (
    'dismiss_report',
    'mute_author_24h',
    'remove_post',
    'change_member_role',
    'change_member_status',
    'kick_school_member',
    'generate_invite',
    'delete_epsu',
    'review_school_application'
  )
);

create or replace function public.ensure_epsu_invite(p_epsu_id uuid, p_invite_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record public.epsu_invites%rowtype;
  invite_token text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_epsu_owner(p_epsu_id) then
    raise exception 'Only owners can generate invites';
  end if;

  if p_invite_role not in ('member', 'moderator') then
    raise exception 'Invalid invite role';
  end if;

  update public.epsu_invites
  set is_active = false
  where epsu_id = p_epsu_id
    and created_by_profile_id = auth.uid()
    and invite_role = p_invite_role
    and is_active = true;

  invite_token := encode(extensions.gen_random_bytes(24), 'base64');
  invite_token := replace(replace(replace(invite_token, '/', ''), '+', ''), '=', '');

  insert into public.epsu_invites (epsu_id, created_by_profile_id, invite_role, token, max_uses)
  values (p_epsu_id, auth.uid(), p_invite_role, invite_token, 1)
  returning * into invite_record;

  insert into public.moderation_actions (actor_profile_id, epsu_id, action_type, details)
  values (
    auth.uid(),
    p_epsu_id,
    'generate_invite',
    jsonb_build_object('invite_role', p_invite_role, 'invite_id', invite_record.id)
  );

  return jsonb_build_object(
    'id', invite_record.id,
    'token', invite_record.token,
    'invite_role', invite_record.invite_role,
    'epsu_id', invite_record.epsu_id,
    'is_active', invite_record.is_active,
    'use_count', invite_record.use_count,
    'max_uses', invite_record.max_uses
  );
end;
$$;

create or replace function public.set_epsu_membership_role(p_membership_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_record public.epsu_memberships%rowtype;
  previous_role text;
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

  if not public.is_epsu_owner(membership_record.epsu_id) then
    raise exception 'Owner access required';
  end if;

  if membership_record.role = 'owner' then
    raise exception 'Owner role cannot be changed here';
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

create or replace function public.set_epsu_membership_status(p_membership_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_record public.epsu_memberships%rowtype;
  previous_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_status not in ('active', 'left') then
    raise exception 'Invalid membership status';
  end if;

  select *
  into membership_record
  from public.epsu_memberships
  where id = p_membership_id;

  if not found then
    raise exception 'Membership not found';
  end if;

  if auth.uid() = membership_record.profile_id then
    if p_status <> 'left' then
      raise exception 'Members can only leave their own Epsu';
    end if;
  elsif not public.is_epsu_owner(membership_record.epsu_id) then
    raise exception 'Owner access required';
  end if;

  if membership_record.role = 'owner' then
    raise exception 'Owner membership status cannot be changed here';
  end if;

  previous_status := membership_record.status;

  update public.epsu_memberships
  set status = p_status
  where id = p_membership_id;

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, action_type, details)
  values (
    auth.uid(),
    membership_record.profile_id,
    membership_record.epsu_id,
    'change_member_status',
    jsonb_build_object('from_status', previous_status, 'to_status', p_status, 'membership_id', p_membership_id)
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.delete_owned_epsu(p_epsu_id uuid)
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

  if not found then
    raise exception 'Epsu not found';
  end if;

  if not public.is_epsu_owner(p_epsu_id) then
    raise exception 'Owner access required';
  end if;

  insert into public.moderation_actions (actor_profile_id, epsu_id, action_type, details)
  values (
    auth.uid(),
    p_epsu_id,
    'delete_epsu',
    jsonb_build_object('slug', target_epsu.slug, 'name', target_epsu.name, 'scope', target_epsu.scope)
  );

  delete from public.epsus
  where id = p_epsu_id;

  return jsonb_build_object('ok', true);
end;
$$;

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

create or replace function public.review_school_application(p_application_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  application_record public.epsu_join_applications%rowtype;
  target_epsu public.epsus%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid application status';
  end if;

  select *
  into application_record
  from public.epsu_join_applications
  where id = p_application_id;

  if not found then
    raise exception 'Application not found';
  end if;

  select *
  into target_epsu
  from public.epsus
  where id = application_record.epsu_id;

  if not found or target_epsu.scope <> 'school' then
    raise exception 'School Epsu not found';
  end if;

  if not public.is_epsu_owner(application_record.epsu_id) then
    raise exception 'Owner access required';
  end if;

  if p_status = 'approved' then
    if exists (
      select 1
      from public.epsu_memberships membership
      where membership.epsu_id = application_record.epsu_id
        and membership.profile_id = application_record.profile_id
        and membership.status = 'kicked'
    ) then
      raise exception 'Removed users cannot rejoin this Epsu';
    end if;

    insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
    values (application_record.epsu_id, application_record.profile_id, 'member', 'active', null)
    on conflict (epsu_id, profile_id)
    do update set
      role = 'member',
      status = 'active',
      muted_until = null;
  end if;

  update public.epsu_join_applications
  set status = p_status,
      reviewed_by_profile_id = auth.uid(),
      reviewed_at = timezone('utc', now())
  where id = p_application_id;

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, action_type, details)
  values (
    auth.uid(),
    application_record.profile_id,
    application_record.epsu_id,
    'review_school_application',
    jsonb_build_object('application_id', p_application_id, 'decision', p_status)
  );

  return jsonb_build_object('ok', true);
end;
$$;
