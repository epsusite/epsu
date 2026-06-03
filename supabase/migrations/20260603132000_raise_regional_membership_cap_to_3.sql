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
        and epsu.review_status = 'approved'
        and (p_excluded_epsu_id is null or membership.epsu_id <> p_excluded_epsu_id)
    )::integer
  end;
$$;

create or replace function public.enforce_epsu_membership_caps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
begin
  if new.profile_id is null then
    return new;
  end if;

  if public.is_platform_admin(new.profile_id) then
    return new;
  end if;

  if new.status not in ('active', 'muted', 'invited') then
    return new;
  end if;

  select *
  into target_epsu
  from public.epsus
  where id = new.epsu_id;

  if not found or target_epsu.review_status <> 'approved' then
    return new;
  end if;

  if target_epsu.scope = 'school' then
    if public.count_school_epsu_memberships(new.profile_id, new.epsu_id) >= 3 then
      raise exception 'You can only be in three school Epsus at once';
    end if;

    return new;
  end if;

  if target_epsu.scope <> 'private' then
    if public.count_regional_epsu_memberships(new.profile_id, new.epsu_id) >= 3 then
      raise exception 'You can only be in three regional Epsus at once';
    end if;
  end if;

  return new;
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

  if target_epsu.scope <> 'school'
    and public.count_regional_epsu_memberships(auth.uid(), p_epsu_id) >= 3 then
    raise exception 'You can only be in three regional Epsus at once';
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

  perform public.convert_trial_epsu_if_ready(p_epsu_id);

  return jsonb_build_object(
    'id', membership_record.id,
    'epsuId', membership_record.epsu_id,
    'profileId', membership_record.profile_id,
    'role', membership_record.role,
    'status', membership_record.status
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

  if target_epsu.scope <> 'school' and target_epsu.scope <> 'private' and public.count_regional_epsu_memberships(auth.uid(), target_epsu.id) >= 3 then
    return jsonb_build_object(
      'ok', false,
      'message', 'You can only be in three regional Epsus at once'
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

  perform public.convert_trial_epsu_if_ready(invite_record.epsu_id);

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

create or replace function public.enforce_regional_suggestion_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_slug text;
  generated_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if new.profile_id is distinct from auth.uid() then
    raise exception 'You can only create suggestions for yourself';
  end if;

  new.title := initcap(lower(regexp_replace(trim(coalesce(new.title, '')), '\s+', ' ', 'g')));
  new.country_code := upper(trim(coalesce(new.country_code, '')));

  if char_length(new.title) < 2 then
    raise exception 'Location required';
  end if;

  if char_length(new.country_code) <> 2 then
    raise exception 'Choose a country first';
  end if;

  if public.count_regional_epsu_memberships(auth.uid()) >= 3 then
    raise exception 'You can only be in three regional Epsus at once';
  end if;

  generated_slug := format(
    '%s-%s-epsu',
    regexp_replace(
      lower(regexp_replace(new.title, '[^A-Za-z0-9]+', '-', 'g')),
      '^-+|-+$',
      '',
      'g'
    ),
    lower(new.country_code)
  );
  generated_name := new.title || ' Epsu';

  if exists (
    select 1
    from public.epsus epsu
    where epsu.review_status in ('pending', 'approved')
      and (
        epsu.slug = generated_slug
        or (
          epsu.country_code = new.country_code
          and lower(trim(epsu.name)) = lower(generated_name)
        )
      )
  ) then
    raise exception 'This Epsu already exists';
  end if;

  if exists (
    select 1
    from public.epsu_suggestions suggestion
    where suggestion.profile_id = auth.uid()
      and suggestion.title = new.title
      and suggestion.country_code = new.country_code
      and suggestion.status = 'new'
  ) then
    raise exception 'You already suggested this location';
  end if;

  return new;
end;
$$;

create or replace function public.review_pending_regional_epsu(
  p_epsu_id uuid,
  p_status text,
  p_logo_path text default null,
  p_host_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
  normalized_logo_path text;
  normalized_host_email text;
  reviewed_at_now timestamptz;
  target_host_id uuid;
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

  normalized_logo_path := nullif(trim(coalesce(p_logo_path, '')), '');
  normalized_host_email := nullif(lower(trim(coalesce(p_host_email, ''))), '');
  reviewed_at_now := timezone('utc', now());

  select *
  into target_epsu
  from public.epsus
  where id = p_epsu_id
    and scope in ('city', 'state', 'country')
    and review_status = 'pending';

  if not found then
    raise exception 'Pending regional Epsu not found';
  end if;

  if p_status = 'approved' then
    if normalized_logo_path is null then
      raise exception 'Regional logo required';
    end if;

    if normalized_host_email is null then
      raise exception 'Host email required';
    end if;

    select profile.id
    into target_host_id
    from public.profiles profile
    where lower(profile.email) = normalized_host_email
    limit 1;

    if target_host_id is null then
      raise exception 'Host email must belong to an existing account';
    end if;

    if not public.is_platform_admin(target_host_id)
      and public.count_regional_epsu_memberships(target_host_id, target_epsu.id) >= 3 then
      raise exception 'User already has three regional Epsus';
    end if;

    update public.epsus
    set review_status = 'approved',
        host_id = target_host_id,
        logo_path = normalized_logo_path,
        is_trial = true,
        trial_member_goal = 14,
        trial_started_at = reviewed_at_now,
        trial_ends_at = reviewed_at_now + interval '7 days',
        trial_converted_at = null,
        trial_created_by_profile_id = target_host_id
    where id = target_epsu.id
    returning * into target_epsu;

    insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
    values (target_epsu.id, target_host_id, 'host', 'active', null)
    on conflict (epsu_id, profile_id)
    do update set
      role = 'host',
      status = 'active',
      muted_until = null;

    update public.epsu_trial_submissions
    set status = 'approved',
        reviewed_at = reviewed_at_now,
        approved_at = reviewed_at_now,
        cooldown_until = reviewed_at_now + interval '7 days'
    where epsu_id = target_epsu.id
      and status = 'pending';

    perform public.convert_trial_epsu_if_ready(target_epsu.id);

    return jsonb_build_object(
      'ok', true,
      'id', target_epsu.id,
      'review_status', target_epsu.review_status
    );
  end if;

  update public.epsu_trial_submissions
  set status = 'rejected',
      reviewed_at = reviewed_at_now,
      cooldown_until = reviewed_at_now + interval '7 days'
  where epsu_id = target_epsu.id
    and status = 'pending';

  delete from public.epsus
  where id = target_epsu.id;

  return jsonb_build_object(
    'ok', true,
    'id', target_epsu.id,
    'review_status', 'rejected'
  );
end;
$$;

notify pgrst, 'reload schema';
