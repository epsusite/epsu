alter table public.post_reports
drop constraint if exists post_reports_reason_length_check;

alter table public.post_reports
add constraint post_reports_reason_length_check
check (reason is null or char_length(trim(reason)) between 2 and 1000);

create or replace function public.create_epsu_post(
  p_epsu_id uuid,
  p_title text,
  p_body text,
  p_reply_to_post_id uuid default null,
  p_flagged_keywords text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_post_number integer;
  created_post public.posts%rowtype;
  reply_target public.posts%rowtype;
  next_release_at timestamptz;
  next_expire_at timestamptz;
  normalized_keywords text[];
  normalized_title text;
  normalized_body text;
  used_top_level_posts integer;
  used_replies integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform public.normalize_expired_mutes(auth.uid());

  if not public.can_view_epsu_feed(p_epsu_id) then
    raise exception 'Join this Epsu before posting.';
  end if;

  normalized_title := trim(coalesce(p_title, ''));
  normalized_body := trim(coalesce(p_body, ''));

  if char_length(normalized_title) < 2 or char_length(normalized_title) > 100 then
    raise exception 'Post title must be between 2 and 100 characters';
  end if;

  if char_length(normalized_body) < 2 or char_length(normalized_body) > 1000 then
    raise exception 'Post body must be between 2 and 1000 characters';
  end if;

  if p_reply_to_post_id is not null then
    select *
    into reply_target
    from public.posts post_record
    where post_record.id = p_reply_to_post_id
      and post_record.epsu_id = p_epsu_id
      and post_record.status = 'active';

    if not found then
      raise exception 'Replies are only available for released posts';
    end if;
  end if;

  if public.is_epsu_muted(p_epsu_id) then
    raise exception 'You have been muted for 24 hours. Until then, you cannot submit posts here.';
  end if;

  next_release_at := public.next_post_release_at(timezone('utc', now()));
  next_expire_at := next_release_at + interval '24 hours';
  normalized_keywords := coalesce(
    array(
      select distinct trim(keyword)
      from unnest(coalesce(p_flagged_keywords, '{}'::text[])) as keyword
      where trim(coalesce(keyword, '')) <> ''
      order by trim(keyword)
    ),
    '{}'::text[]
  );

  select
    count(*) filter (where post_record.reply_to_post_id is null)::integer,
    count(*) filter (where post_record.reply_to_post_id is not null)::integer
  into used_top_level_posts, used_replies
  from public.posts post_record
  where post_record.epsu_id = p_epsu_id
    and post_record.author_id = auth.uid()
    and post_record.release_at = next_release_at
    and post_record.status in ('queued', 'active');

  if p_reply_to_post_id is null and used_top_level_posts >= 2 then
    raise exception 'You can only post to Epsu 2 times per hour';
  end if;

  if p_reply_to_post_id is not null and used_replies >= 1 then
    raise exception 'You can only reply 1 time per hour in an Epsu';
  end if;

  select post_record.number
  into latest_post_number
  from public.posts post_record
  where post_record.epsu_id = p_epsu_id
  order by post_record.number desc
  limit 1
  for update;

  insert into public.posts (
    epsu_id,
    author_id,
    number,
    title,
    body,
    reply_to_post_id,
    status,
    release_at,
    expire_at,
    flagged_keywords,
    keyword_reviewed_at,
    keyword_reviewed_by_profile_id
  )
  values (
    p_epsu_id,
    auth.uid(),
    coalesce(latest_post_number, 0) + 1,
    normalized_title,
    normalized_body,
    p_reply_to_post_id,
    'queued',
    next_release_at,
    next_expire_at,
    normalized_keywords,
    case when cardinality(normalized_keywords) = 0 then timezone('utc', now()) else null end,
    null
  )
  returning * into created_post;

  return jsonb_build_object(
    'id', created_post.id,
    'epsuId', created_post.epsu_id,
    'authorId', created_post.author_id,
    'number', created_post.number,
    'title', created_post.title,
    'body', created_post.body,
    'replyToPostId', created_post.reply_to_post_id,
    'status', created_post.status,
    'releaseAt', created_post.release_at,
    'expireAt', created_post.expire_at,
    'flaggedKeywords', created_post.flagged_keywords
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
  normalized_website text;
  normalized_country_code text;
  active_lock_status text;
  active_cooldown_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_school_name := trim(coalesce(p_school_name, ''));
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

  insert into public.epsus (slug, name, code, scope, website, review_status, country_code, host_id)
  values (
    p_slug,
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
