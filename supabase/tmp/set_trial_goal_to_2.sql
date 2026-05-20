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

create or replace function public.review_pending_school_epsu(p_epsu_id uuid, p_status text, p_logo_path text default null)
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
    raise exception 'Administrator access required';
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

  update public.epsus
  set review_status = 'rejected'
  where id = target_epsu.id;

  return jsonb_build_object('ok', true, 'review_status', 'rejected');
end;
$$;

create or replace function public.review_regional_epsu_suggestion(p_title text, p_country_code text, p_status text, p_logo_path text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_submission public.epsu_trial_submissions%rowtype;
  generated_slug text;
  generated_code text;
  generated_epsu public.epsus%rowtype;
  normalized_title text;
  normalized_country_code text;
  normalized_logo_path text;
  reviewed_at_now timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Administrator access required';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  normalized_title := initcap(lower(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g')));
  normalized_country_code := upper(trim(coalesce(p_country_code, '')));
  normalized_logo_path := nullif(trim(coalesce(p_logo_path, '')), '');
  reviewed_at_now := timezone('utc', now());

  select *
  into target_submission
  from public.epsu_trial_submissions
  where submission_type = 'regional'
    and title = normalized_title
    and country_code = normalized_country_code
    and status = 'pending'
  order by created_at asc
  limit 1;

  if not found then
    raise exception 'Regional trial submission not found';
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

update public.epsus
set trial_member_goal = 14
where is_trial = true
  and coalesce(trial_member_goal, 14) = 14;
