drop index if exists public.epsu_trial_submissions_pending_regional_name_country_idx;

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
  existing_epsu public.epsus%rowtype;
  normalized_title text;
  normalized_country_code text;
  generated_slug_base text;
  generated_slug text;
  generated_name text;
  generated_code text;
  active_lock_status text;
  active_cooldown_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_title := regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g');
  normalized_country_code := upper(trim(coalesce(p_country_code, '')));

  if char_length(normalized_title) < 2 or char_length(normalized_title) > 100 then
    raise exception 'Location must be between 2 and 100 characters';
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

  generated_name := normalized_title || ' Epsu';
  generated_code := left(upper(regexp_replace(normalized_title, '[^A-Za-z0-9]', '', 'g')), 3);

  if generated_code = '' then
    generated_code := 'REG';
  end if;

  select *
  into existing_epsu
  from public.epsus epsu
  where epsu.country_code = normalized_country_code
    and epsu.name = generated_name
    and epsu.scope in ('city', 'state', 'country')
    and epsu.review_status in ('pending', 'approved')
  order by epsu.created_at asc
  limit 1;

  if found then
    if existing_epsu.review_status = 'approved' then
      return jsonb_build_object('ok', false, 'message', 'This Epsu already exists');
    end if;

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
      existing_epsu.id,
      'pending'
    );

    return jsonb_build_object(
      'ok', true,
      'epsu', jsonb_build_object(
        'id', existing_epsu.id,
        'slug', existing_epsu.slug,
        'name', existing_epsu.name,
        'code', existing_epsu.code,
        'scope', existing_epsu.scope,
        'website', existing_epsu.website,
        'logo_path', existing_epsu.logo_path,
        'review_status', existing_epsu.review_status,
        'country_code', existing_epsu.country_code,
        'host_id', existing_epsu.host_id
      ),
      'pooled', true
    );
  end if;

  generated_slug_base := regexp_replace(
    lower(regexp_replace(normalized_title, '[^A-Za-z0-9]+', '-', 'g')),
    '^-+|-+$',
    '',
    'g'
  );
  generated_slug := format(
    '%s-%s-%s-epsu',
    generated_slug_base,
    lower(normalized_country_code),
    substring(md5(normalized_title || '|' || normalized_country_code) from 1 for 6)
  );

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

create or replace function public.fetch_pending_regional_epsus()
returns table (
  id uuid,
  name text,
  country_code text,
  host_email text,
  created_at timestamptz,
  request_count bigint
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
    epsu.created_at,
    count(submission.id)::bigint as request_count
  from public.epsus epsu
  left join public.profiles profile on profile.id = epsu.host_id
  left join public.epsu_trial_submissions submission
    on submission.epsu_id = epsu.id
   and submission.submission_type = 'regional'
   and submission.status = 'pending'
  where public.is_platform_admin()
    and epsu.review_status = 'pending'
    and epsu.scope in ('city', 'state', 'country')
  group by epsu.id, epsu.name, epsu.country_code, profile.email, epsu.created_at
  order by epsu.created_at asc;
$$;

create or replace function public.fetch_regional_epsu_suggestions()
returns table (
  id uuid,
  name text,
  country_code text,
  host_email text,
  created_at timestamptz,
  request_count bigint
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.fetch_pending_regional_epsus();
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
  normalized_title text;
begin
  normalized_title := regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g');

  select epsu.id
  into target_epsu_id
  from public.epsus epsu
  where epsu.review_status = 'pending'
    and epsu.scope in ('city', 'state', 'country')
    and epsu.country_code = upper(trim(coalesce(p_country_code, '')))
    and epsu.name = normalized_title || ' Epsu'
  order by epsu.created_at asc
  limit 1;

  if target_epsu_id is null then
    raise exception 'Pending regional Epsu not found';
  end if;

  return public.review_pending_regional_epsu(target_epsu_id, p_status, p_logo_path);
end;
$$;
