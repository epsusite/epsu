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
  select count(*)
  from public.epsu_memberships membership
  join public.epsus epsu on epsu.id = membership.epsu_id
  where membership.profile_id = p_profile_id
    and membership.status in ('active', 'muted', 'invited')
    and epsu.scope = 'school'
    and (p_excluded_epsu_id is null or membership.epsu_id <> p_excluded_epsu_id);
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
  select count(*)
  from public.epsu_memberships membership
  join public.epsus epsu on epsu.id = membership.epsu_id
  where membership.profile_id = p_profile_id
    and membership.status in ('active', 'muted', 'invited')
    and epsu.scope <> 'school'
    and epsu.scope <> 'private'
    and (p_excluded_epsu_id is null or membership.epsu_id <> p_excluded_epsu_id);
$$;

create or replace function public.ensure_regional_memberships(p_country_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_country_code text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_country_code := upper(trim(coalesce(p_country_code, '')));

  if char_length(normalized_country_code) <> 2 then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.join_public_epsu(p_epsu_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
  membership_record public.epsu_memberships%rowtype;
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

  if target_epsu.scope = 'private' then
    raise exception 'Private Epsus require an invite';
  end if;

  if target_epsu.scope = 'school' then
    raise exception 'School Epsus require an application';
  end if;

  if public.count_regional_epsu_memberships(auth.uid(), p_epsu_id) >= 1 then
    raise exception 'You can only have one regional Epsu at a time';
  end if;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status)
  values (p_epsu_id, auth.uid(), 'member', 'active')
  on conflict (epsu_id, profile_id)
  do update set
    status = case
      when public.epsu_memberships.status = 'left' then 'active'
      else public.epsu_memberships.status
    end
  returning * into membership_record;

  return jsonb_build_object(
    'id', membership_record.id,
    'epsuId', membership_record.epsu_id,
    'profileId', membership_record.profile_id,
    'role', membership_record.role,
    'status', membership_record.status
  );
end;
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

  insert into public.epsus (slug, name, code, scope, website, logo_path, review_status, country_code, owner_id)
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
  values (created_epsu.id, auth.uid(), 'owner', 'active', null)
  on conflict (epsu_id, profile_id)
  do update set
    role = 'owner',
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
    'owner_id', created_epsu.owner_id
  );
end;
$$;

create or replace function public.apply_to_school_epsu(p_epsu_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
  membership_record public.epsu_memberships%rowtype;
  application_record public.epsu_join_applications%rowtype;
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

  if target_epsu.scope <> 'school' then
    raise exception 'Only school Epsus accept applications';
  end if;

  if char_length(trim(coalesce(p_answer, ''))) < 10 or char_length(trim(coalesce(p_answer, ''))) > 1000 then
    raise exception 'Application answer must be between 10 and 1000 characters';
  end if;

  select *
  into membership_record
  from public.epsu_memberships
  where epsu_id = p_epsu_id
    and profile_id = auth.uid();

  if found then
    if membership_record.status = 'kicked' then
      raise exception 'You were removed from this Epsu';
    end if;

    if membership_record.status in ('active', 'muted', 'invited') then
      raise exception 'You are already in this Epsu';
    end if;
  end if;

  if public.count_school_epsu_memberships(auth.uid()) >= 3 then
    raise exception 'You can only be in three school Epsus at once';
  end if;

  if exists (
    select 1
    from public.epsu_join_applications
    where epsu_id = p_epsu_id
      and profile_id = auth.uid()
  ) then
    raise exception 'You already applied to this Epsu';
  end if;

  insert into public.epsu_join_applications (epsu_id, profile_id, answer, status, reviewed_by_profile_id, reviewed_at)
  values (p_epsu_id, auth.uid(), trim(p_answer), 'pending', null, null)
  returning * into application_record;

  return jsonb_build_object(
    'ok', true,
    'applicationId', application_record.id,
    'status', application_record.status
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

  if p_status = 'approved' and updated_epsu.owner_id is not null then
    if public.count_school_epsu_memberships(updated_epsu.owner_id, updated_epsu.id) >= 3 then
      raise exception 'Owner already has three school Epsus';
    end if;

    insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
    values (updated_epsu.id, updated_epsu.owner_id, 'owner', 'active', null)
    on conflict (epsu_id, profile_id)
    do update set
      role = 'owner',
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

  if updated_epsu.owner_id is not null then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    values (updated_epsu.owner_id, 'school_review', notification_title, notification_body, updated_epsu.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', updated_epsu.id,
    'review_status', updated_epsu.review_status
  );
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
  where public.epsu_memberships.role <> 'owner';

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

grant execute on function public.count_school_epsu_memberships(uuid, uuid) to authenticated;
grant execute on function public.count_regional_epsu_memberships(uuid, uuid) to authenticated;
