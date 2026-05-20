alter table public.epsus
  add column if not exists is_trial boolean not null default false,
  add column if not exists trial_member_goal integer,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_converted_at timestamptz,
  add column if not exists trial_created_by_profile_id uuid references public.profiles (id) on delete set null;

create table if not exists public.epsu_trial_submissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  submission_type text not null check (submission_type in ('school', 'regional')),
  title text not null check (char_length(trim(title)) >= 2),
  website text,
  country_code text not null check (char_length(country_code) = 2),
  epsu_id uuid references public.epsus (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'converted')),
  reviewed_at timestamptz,
  approved_at timestamptz,
  cooldown_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists epsu_trial_submissions_profile_idx
  on public.epsu_trial_submissions (profile_id, created_at desc);

create unique index if not exists epsu_trial_submissions_one_pending_per_profile_idx
  on public.epsu_trial_submissions (profile_id)
  where status = 'pending';

create unique index if not exists epsu_trial_submissions_pending_school_name_country_idx
  on public.epsu_trial_submissions (lower(title), country_code)
  where status = 'pending' and submission_type = 'school';

create unique index if not exists epsu_trial_submissions_pending_regional_name_country_idx
  on public.epsu_trial_submissions (lower(title), country_code)
  where status = 'pending' and submission_type = 'regional';

drop trigger if exists set_epsu_trial_submissions_updated_at on public.epsu_trial_submissions;
create trigger set_epsu_trial_submissions_updated_at
before update on public.epsu_trial_submissions
for each row
execute procedure public.set_updated_at();

create or replace function public.fetch_trial_epsu_creator_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_submission public.epsu_trial_submissions%rowtype;
  next_cooldown_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into pending_submission
  from public.epsu_trial_submissions
  where profile_id = auth.uid()
    and status = 'pending'
  order by created_at desc
  limit 1;

  select max(cooldown_until)
  into next_cooldown_until
  from public.epsu_trial_submissions
  where profile_id = auth.uid()
    and cooldown_until > timezone('utc', now());

  return jsonb_build_object(
    'isLocked', pending_submission.id is not null or next_cooldown_until is not null,
    'hasPendingSubmission', pending_submission.id is not null,
    'cooldownUntil', next_cooldown_until,
    'pendingSubmissionType', pending_submission.submission_type,
    'pendingTitle', pending_submission.title
  );
end;
$$;

create or replace function public.convert_trial_epsu_if_ready(p_epsu_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
  current_member_count integer;
begin
  select *
  into target_epsu
  from public.epsus
  where id = p_epsu_id
    and review_status = 'approved'
    and is_trial = true;

  if not found then
    return false;
  end if;

  select count(*)::integer
  into current_member_count
  from (
    select membership.profile_id
    from public.epsu_memberships membership
    where membership.epsu_id = target_epsu.id
      and membership.status = 'active'
    union
    select target_epsu.host_id
    where target_epsu.host_id is not null
  ) member_profiles;

  if current_member_count < coalesce(target_epsu.trial_member_goal, 14) then
    return false;
  end if;

  update public.epsus
  set is_trial = false,
      trial_converted_at = timezone('utc', now()),
      trial_ends_at = null
  where id = target_epsu.id;

  update public.epsu_trial_submissions
  set status = 'converted'
  where epsu_id = target_epsu.id
    and status = 'approved';

  return true;
end;
$$;

create or replace function public.process_trial_epsus()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  converted_count integer := 0;
  deleted_count integer := 0;
  target_record record;
begin
  for target_record in
    select epsu.id
    from public.epsus epsu
    where epsu.review_status = 'approved'
      and epsu.is_trial = true
  loop
    if public.convert_trial_epsu_if_ready(target_record.id) then
      converted_count := converted_count + 1;
    end if;
  end loop;

  for target_record in
    select epsu.id
    from public.epsus epsu
    where epsu.review_status = 'approved'
      and epsu.is_trial = true
      and epsu.trial_ends_at is not null
      and epsu.trial_ends_at <= timezone('utc', now())
  loop
    delete from public.app_notifications
    where related_epsu_id = target_record.id;

    update public.epsu_trial_submissions
    set status = 'expired'
    where epsu_id = target_record.id
      and status = 'approved';

    delete from public.epsus
    where id = target_record.id
      and is_trial = true;

    if found then
      deleted_count := deleted_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'convertedCount', converted_count,
    'deletedCount', deleted_count
  );
end;
$$;

create or replace function public.create_school_epsu(
  p_school_name text,
  p_code text,
  p_slug text,
  p_website text,
  p_country_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_epsu public.epsus%rowtype;
  normalized_school_name text;
  normalized_country_code text;
  active_lock_status text;
  active_cooldown_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_school_name := trim(coalesce(p_school_name, ''));
  normalized_country_code := upper(trim(coalesce(p_country_code, '')));

  if normalized_school_name = '' then
    raise exception 'School name required';
  end if;

  if char_length(normalized_country_code) <> 2 then
    raise exception 'Choose your country before creating a school Epsu';
  end if;

  select submission.status, submission.cooldown_until
  into active_lock_status, active_cooldown_until
  from public.epsu_trial_submissions submission
  where submission.profile_id = auth.uid()
    and (
      submission.status = 'pending'
      or submission.cooldown_until > timezone('utc', now())
    )
  order by submission.created_at desc
  limit 1;

  if active_lock_status = 'pending' then
    raise exception 'You already have a trial Epsu waiting for review';
  end if;

  if active_cooldown_until is not null and active_cooldown_until > timezone('utc', now()) then
    raise exception 'You cannot create another Epsu yet';
  end if;

  insert into public.epsus (slug, name, code, scope, website, review_status, country_code, host_id)
  values (
    p_slug,
    normalized_school_name,
    p_code,
    'school',
    p_website,
    'pending',
    normalized_country_code,
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

  insert into public.epsu_trial_submissions (
    profile_id,
    submission_type,
    title,
    website,
    country_code,
    epsu_id,
    status
  )
  values (
    auth.uid(),
    'school',
    normalized_school_name,
    nullif(trim(coalesce(p_website, '')), ''),
    normalized_country_code,
    created_epsu.id,
    'pending'
  );

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

create or replace function public.submit_regional_epsu_suggestion(p_title text, p_country_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_title text;
  normalized_country_code text;
  generated_slug text;
  generated_name text;
  active_lock_status text;
  active_cooldown_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_title := initcap(lower(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g')));
  normalized_country_code := upper(trim(coalesce(p_country_code, '')));

  if char_length(normalized_title) < 2 then
    raise exception 'Location required';
  end if;

  if char_length(normalized_country_code) <> 2 then
    raise exception 'Choose a country first';
  end if;

  select submission.status, submission.cooldown_until
  into active_lock_status, active_cooldown_until
  from public.epsu_trial_submissions submission
  where submission.profile_id = auth.uid()
    and (
      submission.status = 'pending'
      or submission.cooldown_until > timezone('utc', now())
    )
  order by submission.created_at desc
  limit 1;

  if active_lock_status = 'pending' then
    return jsonb_build_object('ok', false, 'message', 'You already have a trial Epsu waiting for review');
  end if;

  if active_cooldown_until is not null and active_cooldown_until > timezone('utc', now()) then
    return jsonb_build_object('ok', false, 'message', 'You cannot create another Epsu yet');
  end if;

  generated_slug := format(
    '%s-%s-epsu',
    regexp_replace(
      lower(regexp_replace(normalized_title, '[^A-Za-z0-9]+', '-', 'g')),
      '^-+|-+$',
      '',
      'g'
    ),
    lower(normalized_country_code)
  );
  generated_name := normalized_title || ' Epsu';

  if exists (
    select 1
    from public.epsus epsu
    where epsu.review_status in ('pending', 'approved')
      and (
        epsu.slug = generated_slug
        or (
          epsu.country_code = normalized_country_code
          and lower(trim(epsu.name)) = lower(generated_name)
        )
      )
  ) then
    return jsonb_build_object('ok', false, 'message', 'This Epsu already exists');
  end if;

  if exists (
    select 1
    from public.epsu_trial_submissions submission
    where submission.submission_type = 'regional'
      and submission.status = 'pending'
      and submission.country_code = normalized_country_code
      and lower(submission.title) = lower(normalized_title)
  ) then
    return jsonb_build_object('ok', false, 'message', 'This Epsu is already waiting for review');
  end if;

  insert into public.epsu_trial_submissions (
    profile_id,
    submission_type,
    title,
    country_code,
    status
  )
  values (
    auth.uid(),
    'regional',
    normalized_title,
    normalized_country_code,
    'pending'
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fetch_regional_epsu_suggestions()
returns table (
  title text,
  country_code text,
  vote_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    submission.title,
    submission.country_code,
    1::bigint as vote_count
  from public.epsu_trial_submissions submission
  where public.is_platform_admin()
    and submission.submission_type = 'regional'
    and submission.status = 'pending'
  order by submission.created_at asc;
$$;

create or replace function public.review_pending_school_epsu(
  p_epsu_id uuid,
  p_status text,
  p_logo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
  normalized_logo_path text;
  reviewed_at_now timestamptz;
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
  reviewed_at_now := timezone('utc', now());

  select *
  into target_epsu
  from public.epsus
  where id = p_epsu_id
    and scope = 'school'
    and review_status = 'pending';

  if not found then
    raise exception 'Pending school Epsu not found';
  end if;

  if p_status = 'approved' then
    if normalized_logo_path is null then
      raise exception 'School logo required';
    end if;

    update public.epsus
    set review_status = 'approved',
        logo_path = normalized_logo_path,
        is_trial = true,
        trial_member_goal = 14,
        trial_started_at = reviewed_at_now,
        trial_ends_at = reviewed_at_now + interval '7 days',
        trial_converted_at = null,
        trial_created_by_profile_id = target_epsu.host_id
    where id = target_epsu.id
    returning * into target_epsu;

    if target_epsu.host_id is not null then
      if not public.is_platform_admin(target_epsu.host_id)
        and public.count_school_epsu_memberships(target_epsu.host_id, target_epsu.id) >= 3 then
        raise exception 'User already has three school Epsus';
      end if;

      insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
      values (target_epsu.id, target_epsu.host_id, 'host', 'active', null)
      on conflict (epsu_id, profile_id)
      do update set
        role = 'host',
        status = 'active',
        muted_until = null;
    end if;

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

create or replace function public.review_regional_epsu_suggestion(
  p_title text,
  p_country_code text,
  p_status text,
  p_logo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_submission public.epsu_trial_submissions%rowtype;
  normalized_title text;
  normalized_country_code text;
  normalized_logo_path text;
  generated_slug text;
  generated_code text;
  generated_epsu public.epsus%rowtype;
  reviewed_at_now timestamptz;
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

  normalized_title := trim(coalesce(p_title, ''));
  normalized_country_code := upper(trim(coalesce(p_country_code, '')));
  normalized_logo_path := nullif(trim(coalesce(p_logo_path, '')), '');
  reviewed_at_now := timezone('utc', now());

  if normalized_title = '' then
    raise exception 'Suggestion title required';
  end if;

  if char_length(normalized_country_code) <> 2 then
    raise exception 'Country code required';
  end if;

  select *
  into target_submission
  from public.epsu_trial_submissions submission
  where submission.submission_type = 'regional'
    and submission.status = 'pending'
    and submission.country_code = normalized_country_code
    and lower(submission.title) = lower(normalized_title)
  order by submission.created_at asc
  limit 1;

  if not found then
    raise exception 'Pending regional Epsu not found';
  end if;

  if p_status = 'approved' and normalized_logo_path is null then
    raise exception 'Regional logo required';
  end if;

  if p_status = 'approved' then
    generated_slug := format(
      '%s-%s-epsu',
      regexp_replace(
        lower(regexp_replace(normalized_title, '[^A-Za-z0-9]+', '-', 'g')),
        '^-+|-+$',
        '',
        'g'
      ),
      lower(normalized_country_code)
    );
    generated_code := left(upper(regexp_replace(normalized_title, '[^A-Za-z0-9]', '', 'g')), 3);

    if generated_code = '' then
      generated_code := 'REG';
    end if;

    insert into public.epsus (
      slug,
      name,
      code,
      scope,
      country_code,
      review_status,
      logo_path,
      host_id,
      is_trial,
      trial_member_goal,
      trial_started_at,
      trial_ends_at,
      trial_converted_at,
      trial_created_by_profile_id
    )
    values (
      generated_slug,
      normalized_title || ' Epsu',
      generated_code,
      'city',
      normalized_country_code,
      'approved',
      normalized_logo_path,
      target_submission.profile_id,
      true,
      100,
      reviewed_at_now,
      reviewed_at_now + interval '7 days',
      null,
      target_submission.profile_id
    )
    returning * into generated_epsu;

    if target_submission.profile_id is not null then
      if not public.is_platform_admin(target_submission.profile_id)
        and public.count_regional_epsu_memberships(target_submission.profile_id, generated_epsu.id) >= 1 then
        raise exception 'User already has one regional Epsu';
      end if;

      insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
      values (generated_epsu.id, target_submission.profile_id, 'host', 'active', null)
      on conflict (epsu_id, profile_id)
      do update set
        role = 'host',
        status = 'active',
        muted_until = null;
    end if;

    update public.epsu_trial_submissions
    set epsu_id = generated_epsu.id,
        status = 'approved',
        reviewed_at = reviewed_at_now,
        approved_at = reviewed_at_now,
        cooldown_until = reviewed_at_now + interval '7 days'
    where id = target_submission.id;

    perform public.convert_trial_epsu_if_ready(generated_epsu.id);

    return jsonb_build_object('ok', true);
  end if;

  update public.epsu_trial_submissions
  set status = 'rejected',
      reviewed_at = reviewed_at_now,
      cooldown_until = reviewed_at_now + interval '7 days'
  where id = target_submission.id;

  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists public.fetch_guest_epsus(text);

create function public.fetch_guest_epsus(p_country_code text)
returns table (
  id uuid,
  slug text,
  name text,
  code text,
  scope text,
  website text,
  review_status text,
  country_code text,
  logo_path text,
  is_trial boolean,
  trial_member_goal integer,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  member_count bigint,
  online_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_epsus as (
    select
      epsu.id,
      epsu.slug,
      epsu.name,
      epsu.code,
      epsu.scope,
      epsu.website,
      epsu.review_status,
      epsu.country_code,
      epsu.logo_path,
      epsu.is_trial,
      epsu.trial_member_goal,
      epsu.trial_started_at,
      epsu.trial_ends_at
    from public.epsus epsu
    where epsu.review_status = 'approved'
      and epsu.scope in ('country', 'state', 'city', 'school')
      and epsu.country_code = upper(trim(coalesce(p_country_code, '')))
  ),
  member_profiles as (
    select membership.epsu_id, membership.profile_id
    from public.epsu_memberships membership
    where membership.status = 'active'
      and membership.epsu_id in (select epsu.id from visible_epsus epsu)
    union
    select epsu.id as epsu_id, epsu.host_id as profile_id
    from public.epsus epsu
    where epsu.host_id is not null
      and epsu.id in (select visible.id from visible_epsus visible)
  ),
  member_counts as (
    select
      member_profiles.epsu_id,
      count(*)::bigint as member_count
    from member_profiles
    group by member_profiles.epsu_id
  ),
  online_counts as (
    select
      presence.epsu_id,
      count(*)::bigint as online_count
    from public.epsu_presence presence
    where presence.epsu_id in (select epsu.id from visible_epsus epsu)
    group by presence.epsu_id
  )
  select
    epsu.id,
    epsu.slug,
    epsu.name,
    epsu.code,
    epsu.scope,
    epsu.website,
    epsu.review_status,
    epsu.country_code,
    epsu.logo_path,
    epsu.is_trial,
    epsu.trial_member_goal,
    epsu.trial_started_at,
    epsu.trial_ends_at,
    coalesce(member_counts.member_count, 0)::bigint as member_count,
    coalesce(online_counts.online_count, 0)::bigint as online_count
  from visible_epsus epsu
  left join member_counts on member_counts.epsu_id = epsu.id
  left join online_counts on online_counts.epsu_id = epsu.id
  order by coalesce(member_counts.member_count, 0) desc, epsu.name asc;
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

  if target_epsu.scope <> 'school'
    and public.count_regional_epsu_memberships(auth.uid(), p_epsu_id) >= 1 then
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

  if not public.is_epsu_host(p_epsu_id) and not public.is_platform_admin() then
    raise exception 'Host access required';
  end if;

  delete from public.app_notifications
  where related_epsu_id = p_epsu_id;

  if target_epsu.is_trial then
    update public.epsu_trial_submissions
    set status = 'expired'
    where epsu_id = p_epsu_id
      and status = 'approved';
  end if;

  delete from public.epsus
  where id = p_epsu_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.fetch_trial_epsu_creator_state() to authenticated;
grant execute on function public.process_trial_epsus() to authenticated;
grant execute on function public.convert_trial_epsu_if_ready(uuid) to authenticated;

create extension if not exists pg_cron;

do $$
begin
  if exists (
    select 1
    from pg_namespace
    where nspname = 'cron'
  ) then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'process_trial_epsus_every_5_minutes';

    perform cron.schedule(
      'process_trial_epsus_every_5_minutes',
      '*/5 * * * *',
      $sql$select public.process_trial_epsus();$sql$
    );
  end if;
end
$$;
