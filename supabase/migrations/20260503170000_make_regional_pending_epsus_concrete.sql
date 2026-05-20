create or replace function public.create_regional_epsu(
  p_title text,
  p_country_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_epsu public.epsus%rowtype;
  normalized_title text;
  normalized_country_code text;
  generated_slug text;
  generated_name text;
  generated_code text;
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
  generated_code := left(upper(regexp_replace(normalized_title, '[^A-Za-z0-9]', '', 'g')), 3);

  if generated_code = '' then
    generated_code := 'REG';
  end if;

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

  insert into public.epsus (slug, name, code, scope, review_status, country_code, host_id)
  values (
    generated_slug,
    generated_name,
    generated_code,
    'city',
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
    country_code,
    epsu_id,
    status
  )
  values (
    auth.uid(),
    'regional',
    normalized_title,
    normalized_country_code,
    created_epsu.id,
    'pending'
  );

  return jsonb_build_object(
    'ok', true,
    'epsu', jsonb_build_object(
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
    )
  );
end;
$$;

create or replace function public.submit_regional_epsu_suggestion(p_title text, p_country_code text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.create_regional_epsu(p_title, p_country_code);
$$;

create or replace function public.fetch_pending_regional_epsus()
returns table (
  id uuid,
  name text,
  country_code text,
  host_email text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    epsu.id,
    epsu.name,
    epsu.country_code,
    profile.email as host_email,
    epsu.created_at
  from public.epsus epsu
  left join public.profiles profile on profile.id = epsu.host_id
  where public.is_platform_admin()
    and epsu.review_status = 'pending'
    and epsu.scope in ('city', 'state', 'country')
  order by epsu.created_at asc;
$$;

drop function if exists public.fetch_regional_epsu_suggestions();

create or replace function public.fetch_regional_epsu_suggestions()
returns table (
  id uuid,
  name text,
  country_code text,
  host_email text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.fetch_pending_regional_epsus();
$$;

create or replace function public.review_pending_regional_epsu(
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
    and scope in ('city', 'state', 'country')
    and review_status = 'pending';

  if not found then
    raise exception 'Pending regional Epsu not found';
  end if;

  if p_status = 'approved' then
    if normalized_logo_path is null then
      raise exception 'Regional logo required';
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
        and public.count_regional_epsu_memberships(target_epsu.host_id, target_epsu.id) >= 1 then
        raise exception 'User already has one regional Epsu';
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
  target_epsu_id uuid;
begin
  select epsu.id
  into target_epsu_id
  from public.epsus epsu
  where epsu.review_status = 'pending'
    and epsu.scope in ('city', 'state', 'country')
    and epsu.country_code = upper(trim(coalesce(p_country_code, '')))
    and lower(trim(epsu.name)) = lower(initcap(lower(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g'))) || ' Epsu')
  order by epsu.created_at asc
  limit 1;

  if target_epsu_id is null then
    raise exception 'Pending regional Epsu not found';
  end if;

  return public.review_pending_regional_epsu(target_epsu_id, p_status, p_logo_path);
end;
$$;
