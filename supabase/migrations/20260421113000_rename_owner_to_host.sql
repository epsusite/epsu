do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'epsus'
      and column_name = 'owner_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'epsus'
      and column_name = 'host_id'
  ) then
    alter table public.epsus rename column owner_id to host_id;
  end if;
end $$;

alter table public.epsu_memberships
drop constraint if exists epsu_memberships_role_check;

update public.epsu_memberships
set role = 'host'
where role = 'owner';

alter table public.epsu_memberships
add constraint epsu_memberships_role_check
check (role in ('member', 'host', 'moderator'));

create or replace function public.is_epsu_host(target_epsu_id uuid, target_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
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

create or replace function public.is_epsu_owner(target_epsu_id uuid, target_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_epsu_host(target_epsu_id, target_profile_id);
$$;

create or replace function public.is_epsu_moderator(target_epsu_id uuid, target_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
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

drop function if exists public.fetch_pending_school_epsus();

create or replace function public.fetch_pending_school_epsus()
returns table (
  id uuid,
  slug text,
  name text,
  code text,
  website text,
  country_code text,
  review_status text,
  created_at timestamptz,
  host_id uuid,
  host_username text
)
language sql
security definer
set search_path = public
as $$
  select
    epsu.id,
    epsu.slug,
    epsu.name,
    epsu.code,
    epsu.website,
    epsu.country_code,
    epsu.review_status,
    epsu.created_at,
    epsu.host_id,
    profile.username as host_username
  from public.epsus epsu
  left join public.profiles profile on profile.id = epsu.host_id
  where public.is_platform_admin()
    and epsu.scope = 'school'
    and epsu.review_status = 'pending'
  order by epsu.created_at asc;
$$;

create or replace function public.create_school_epsu(
  p_school_name text,
  p_code text,
  p_slug text,
  p_website text,
  p_country_code text,
  p_logo_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_epsu public.epsus%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if public.count_school_epsu_memberships(auth.uid()) >= 3 then
    raise exception 'You can only be in three school Epsus at once';
  end if;

  if coalesce(trim(p_logo_path), '') = '' then
    raise exception 'School logo required';
  end if;

  insert into public.epsus (slug, name, code, scope, website, logo_path, review_status, country_code, host_id)
  values (
    p_slug,
    p_school_name,
    p_code,
    'school',
    p_website,
    trim(p_logo_path),
    'pending',
    upper(trim(p_country_code)),
    auth.uid()
  )
  returning * into created_epsu;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
  values (created_epsu.id, auth.uid(), 'host', 'active', null)
  on conflict (epsu_id, profile_id)
  do update set
    role = 'host',
    status = 'active',
    muted_until = null;

  return jsonb_build_object(
    'id', created_epsu.id,
    'slug', created_epsu.slug,
    'name', created_epsu.name,
    'code', created_epsu.code,
    'scope', created_epsu.scope,
    'website', created_epsu.website,
    'logo_path', created_epsu.logo_path,
    'review_status', created_epsu.review_status,
    'country_code', created_epsu.country_code,
    'host_id', created_epsu.host_id
  );
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

  if not public.is_epsu_host(application_record.epsu_id) then
    raise exception 'Host access required';
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

    if public.count_school_epsu_memberships(application_record.profile_id, application_record.epsu_id) >= 3 then
      raise exception 'Applicant already has three school Epsus';
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

create or replace function public.review_pending_school_epsu(p_epsu_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  updated_epsu public.epsus%rowtype;
  notification_title text;
  notification_body text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  update public.epsus
  set review_status = p_status
  where id = p_epsu_id
    and scope = 'school'
    and review_status = 'pending'
  returning * into updated_epsu;

  if not found then
    raise exception 'Pending school Epsu not found';
  end if;

  if p_status = 'approved' and updated_epsu.host_id is not null then
    if public.count_school_epsu_memberships(updated_epsu.host_id, updated_epsu.id) >= 3 then
      raise exception 'Host already has three school Epsus';
    end if;

    insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
    values (updated_epsu.id, updated_epsu.host_id, 'host', 'active', null)
    on conflict (epsu_id, profile_id)
    do update set
      role = 'host',
      status = 'active',
      muted_until = null;
  end if;

  if p_status = 'rejected' and updated_epsu.logo_path is not null then
    perform public.delete_school_logo_object(updated_epsu.logo_path);

    update public.epsus
    set logo_path = null
    where id = updated_epsu.id;

    updated_epsu.logo_path := null;
  end if;

  notification_title := case
    when p_status = 'approved' then 'School Epsu approved'
    else 'School Epsu rejected'
  end;

  notification_body := case
    when p_status = 'approved' then format('Congratulations, your Epsu "%s" has been approved and is live!', updated_epsu.name)
    else format('Sorry, your Epsu "%s" has been rejected.', updated_epsu.name)
  end;

  if updated_epsu.host_id is not null then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    values (updated_epsu.host_id, 'school_review', notification_title, notification_body, updated_epsu.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', updated_epsu.id,
    'review_status', updated_epsu.review_status
  );
end;
$$;

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

  if not public.is_epsu_host(p_epsu_id) then
    raise exception 'Only hosts can generate invites';
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

  if not public.is_epsu_host(membership_record.epsu_id) then
    raise exception 'Host access required';
  end if;

  if membership_record.role = 'host' then
    raise exception 'Host role cannot be changed here';
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
  elsif not public.is_epsu_host(membership_record.epsu_id) then
    raise exception 'Host access required';
  end if;

  if membership_record.role = 'host' then
    raise exception 'Host membership status cannot be changed here';
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

create or replace function public.delete_hosted_epsu(p_epsu_id uuid)
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

  if not public.is_epsu_host(p_epsu_id) then
    raise exception 'Host access required';
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

create or replace function public.delete_owned_epsu(p_epsu_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.delete_hosted_epsu(p_epsu_id);
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
  next_status := case when invite_record.invite_role = 'moderator' then 'active' else 'invited' end;

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
      when next_status = 'invited' then 'Join request sent, wait for host approval'
      else 'Moderator access granted'
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
  delete from public.epsu_join_applications where profile_id = current_user_id;
  delete from public.epsu_memberships where profile_id = current_user_id;
  delete from public.epsu_suggestions where profile_id = current_user_id;

  delete from auth.users
  where id = current_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.is_epsu_host(uuid, uuid) to authenticated;
grant execute on function public.delete_hosted_epsu(uuid) to authenticated;
