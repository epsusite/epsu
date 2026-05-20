drop index if exists public.epsu_trial_submissions_pending_school_name_country_idx;

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
  existing_epsu public.epsus%rowtype;
  normalized_school_name text;
  normalized_website text;
  normalized_country_code text;
  generated_slug_base text;
  generated_slug text;
  active_lock_status text;
  active_cooldown_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_school_name := regexp_replace(trim(coalesce(p_school_name, '')), '\s+', ' ', 'g');
  normalized_website := trim(coalesce(p_website, ''));
  normalized_country_code := upper(trim(coalesce(p_country_code, '')));

  if char_length(normalized_school_name) < 2 or char_length(normalized_school_name) > 100 then
    raise exception 'School name must be between 2 and 100 characters';
  end if;

  if char_length(normalized_website) < 2 or char_length(normalized_website) > 100 then
    raise exception 'Website must be between 2 and 100 characters';
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

  select *
  into existing_epsu
  from public.epsus epsu
  where epsu.scope = 'school'
    and epsu.country_code = normalized_country_code
    and epsu.name = normalized_school_name
    and coalesce(epsu.website, '') = normalized_website
    and epsu.review_status in ('pending', 'approved')
  order by epsu.created_at asc
  limit 1;

  if found then
    if existing_epsu.review_status = 'approved' then
      raise exception '% already exists.', existing_epsu.name;
    end if;

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
      normalized_website,
      normalized_country_code,
      existing_epsu.id,
      'pending'
    );

    return jsonb_build_object(
      'id', existing_epsu.id,
      'slug', existing_epsu.slug,
      'name', existing_epsu.name,
      'code', existing_epsu.code,
      'scope', existing_epsu.scope,
      'website', existing_epsu.website,
      'logo_path', existing_epsu.logo_path,
      'review_status', existing_epsu.review_status,
      'country_code', existing_epsu.country_code,
      'host_id', existing_epsu.host_id,
      'pooled', true
    );
  end if;

  generated_slug_base := regexp_replace(
    lower(regexp_replace(normalized_school_name, '[^A-Za-z0-9]+', '-', 'g')),
    '^-+|-+$',
    '',
    'g'
  );
  generated_slug := format(
    '%s-%s-%s-epsu',
    generated_slug_base,
    lower(normalized_country_code),
    substring(md5(normalized_school_name || '|' || normalized_website || '|' || normalized_country_code) from 1 for 6)
  );

  insert into public.epsus (slug, name, code, scope, website, review_status, country_code, host_id)
  values (
    generated_slug,
    normalized_school_name,
    p_code,
    'school',
    normalized_website,
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
    normalized_website,
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
  host_email text,
  request_count bigint
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
    profile.email as host_email,
    count(submission.id)::bigint as request_count
  from public.epsus epsu
  left join public.profiles profile on profile.id = epsu.host_id
  left join public.epsu_trial_submissions submission
    on submission.epsu_id = epsu.id
   and submission.submission_type = 'school'
   and submission.status = 'pending'
  where public.is_platform_admin()
    and epsu.scope = 'school'
    and epsu.review_status = 'pending'
  group by
    epsu.id,
    epsu.slug,
    epsu.name,
    epsu.code,
    epsu.website,
    epsu.country_code,
    epsu.review_status,
    epsu.created_at,
    epsu.host_id,
    profile.email
  order by epsu.created_at asc;
$$;
