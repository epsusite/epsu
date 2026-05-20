create extension if not exists "pgcrypto";
create extension if not exists pg_net;

-- Current bootstrap snapshot for the live public tables.
-- Policies, RPCs, and later behavioral changes still live in the migration files.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 20),
  email text unique,
  is_admin boolean not null default false,
  notifications_enabled boolean not null default false,
  date_of_birth date,
  country_code text check (country_code is null or char_length(country_code) = 2),
  tos_privacy_accepted_at timestamptz,
  community_guidelines_accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.epsus (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  code text not null check (char_length(code) between 1 and 3),
  scope text not null default 'city' check (scope in ('city', 'state', 'country', 'school', 'private')),
  membership_cap integer,
  host_id uuid references public.profiles (id) on delete set null,
  website text,
  logo_path text,
  review_status text not null default 'approved' check (review_status in ('pending', 'approved', 'rejected')),
  is_rentable boolean not null default false,
  annual_price_usd integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  country_code text check (country_code is null or char_length(country_code) = 2),
  is_trial boolean not null default false,
  trial_member_goal integer,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  trial_converted_at timestamptz,
  trial_created_by_profile_id uuid references public.profiles (id) on delete set null
);

create table if not exists public.epsu_memberships (
  id uuid primary key default gen_random_uuid(),
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'host', 'moderator')),
  status text not null default 'active' check (status in ('active', 'muted', 'left', 'kicked')),
  created_at timestamptz not null default timezone('utc', now()),
  muted_until timestamptz,
  unique (epsu_id, profile_id)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  number integer not null,
  title text not null,
  body text not null,
  reply_to_post_id uuid references public.posts (id) on delete set null,
  like_count integer not null default 0,
  dislike_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'deleted_by_threshold', 'deleted_by_mod')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (epsu_id, number)
);

create table if not exists public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (post_id, profile_id)
);

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  target_profile_id uuid references public.profiles (id) on delete set null,
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  action_type text not null check (
    action_type in (
      'dismiss_report',
      'mute_author_24h',
      'remove_post',
      'change_member_role',
      'change_member_status',
      'kick_school_member',
      'redeem_invite'
    )
  ),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.epsu_subscriptions (
  id uuid primary key default gen_random_uuid(),
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'manual' check (provider in ('manual', 'stripe', 'apple', 'google', 'paypal', 'paddle')),
  external_subscription_id text,
  plan_name text not null,
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due', 'expired')),
  renewal_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.epsu_suggestions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(trim(title)) >= 2),
  country_code text check (country_code is null or char_length(country_code) = 2),
  details text check (details is null or char_length(details) <= 240),
  status text not null default 'new' check (status in ('new', 'reviewed', 'approved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now())
);

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

create table if not exists public.epsu_invites (
  id uuid primary key default gen_random_uuid(),
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  invite_role text not null check (invite_role in ('member', 'moderator')),
  token text not null unique,
  max_uses integer not null default 1 check (max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.has_epsu_capability(
  p_epsu_id uuid,
  p_capability text,
  p_profile_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_capability = 'host' then
    return public.is_epsu_host(p_epsu_id, p_profile_id);
  end if;

  if p_capability = 'moderate' then
    return public.is_epsu_moderator(p_epsu_id, p_profile_id);
  end if;

  if p_capability = 'admin' then
    return public.is_platform_admin(p_profile_id);
  end if;

  raise exception 'Unknown capability: %', p_capability;
end;
$$;

create or replace function public.ensure_platform_admin_epsu_membership(
  p_epsu_id uuid,
  p_profile_id uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_epsu_id is null or p_profile_id is null then
    return;
  end if;

  if not public.is_platform_admin(p_profile_id) then
    return;
  end if;

  if not exists (
    select 1
    from public.epsus epsu
    where epsu.id = p_epsu_id
  ) then
    return;
  end if;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
  values (p_epsu_id, p_profile_id, 'member', 'active', null)
  on conflict (epsu_id, profile_id)
  do update set
    role = case
      when public.epsu_memberships.role in ('host', 'moderator') then public.epsu_memberships.role
      else 'member'
    end,
    status = case
      when public.epsu_memberships.status = 'muted'
        and (
          public.epsu_memberships.muted_until is null
          or public.epsu_memberships.muted_until > timezone('utc', now())
        ) then 'muted'
      else 'active'
    end,
    muted_until = case
      when public.epsu_memberships.status = 'muted'
        and (
          public.epsu_memberships.muted_until is null
          or public.epsu_memberships.muted_until > timezone('utc', now())
        ) then public.epsu_memberships.muted_until
      else null
    end;
end;
$$;

create or replace function public.ensure_platform_admin_memberships(
  p_profile_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ensured_count integer := 0;
begin
  if p_profile_id is null then
    raise exception 'Authentication required';
  end if;

  if auth.uid() is distinct from p_profile_id and not public.is_platform_admin() then
    raise exception 'Administrator access required';
  end if;

  if not public.is_platform_admin(p_profile_id) then
    return jsonb_build_object('ok', true, 'ensuredCount', 0);
  end if;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
  select epsu.id, p_profile_id, 'member', 'active', null
  from public.epsus epsu
  on conflict (epsu_id, profile_id)
  do update set
    role = case
      when public.epsu_memberships.role in ('host', 'moderator') then public.epsu_memberships.role
      else 'member'
    end,
    status = case
      when public.epsu_memberships.status = 'muted'
        and (
          public.epsu_memberships.muted_until is null
          or public.epsu_memberships.muted_until > timezone('utc', now())
        ) then 'muted'
      else 'active'
    end,
    muted_until = case
      when public.epsu_memberships.status = 'muted'
        and (
          public.epsu_memberships.muted_until is null
          or public.epsu_memberships.muted_until > timezone('utc', now())
        ) then public.epsu_memberships.muted_until
      else null
    end;

  get diagnostics ensured_count = row_count;

  return jsonb_build_object('ok', true, 'ensuredCount', ensured_count);
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

  if not public.has_epsu_capability(p_epsu_id, 'host') then
    raise exception 'Host access required';
  end if;

  delete from public.app_notifications
  where related_epsu_id = p_epsu_id;

  perform public.request_epsu_logo_cleanup(target_epsu.logo_path);

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

  if not public.has_epsu_capability(p_epsu_id, 'host') then
    raise exception 'Host access required';
  end if;

  if public.is_platform_admin(p_profile_id) then
    raise exception 'Platform admins cannot be kicked';
  end if;

  if public.is_epsu_host(p_epsu_id, p_profile_id) then
    raise exception 'Hosts cannot be kicked';
  end if;

  update public.epsu_memberships
  set status = 'kicked',
      muted_until = null
  where epsu_id = p_epsu_id
    and profile_id = p_profile_id;

  delete from public.moderation_actions
  where epsu_id = p_epsu_id
    and target_profile_id = p_profile_id
    and action_type in ('remove_post', 'mute_author_24h');

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

create or replace function public.kick_epsu_member(p_epsu_id uuid, p_profile_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.kick_school_epsu_member(p_epsu_id, p_profile_id);
$$;

create or replace function public.leave_epsu(p_epsu_id uuid)
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

  if public.is_platform_admin() then
    raise exception 'Platform admins cannot leave Epsus';
  end if;

  select *
  into target_epsu
  from public.epsus
  where id = p_epsu_id;

  if not found then
    raise exception 'Epsu not found';
  end if;

  select *
  into membership_record
  from public.epsu_memberships
  where epsu_id = p_epsu_id
    and profile_id = auth.uid();

  if not found or membership_record.status not in ('active', 'muted') then
    raise exception 'Membership not found';
  end if;

  if public.is_epsu_host(p_epsu_id, auth.uid()) then
    raise exception 'Hosts cannot leave here';
  end if;

  update public.epsu_memberships
  set status = 'left',
      muted_until = null
  where id = membership_record.id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.leave_school_epsu(p_epsu_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.leave_epsu(p_epsu_id);
$$;

create or replace function public.fetch_background_job_health()
returns table (
  job_name text,
  schedule text,
  last_run_started_at timestamptz,
  last_run_finished_at timestamptz,
  last_run_status text,
  is_healthy boolean
)
language sql
stable
security definer
set search_path = public, cron
as $$
  with expected_jobs as (
    select * from (
      values
        ('epsu-hourly-post-cycle'::text),
        ('epsu-expired-post-cleanup'::text),
        ('epsu-expired-moderation-actions-cleanup'::text),
        ('process_trial_epsus_every_5_minutes'::text),
        ('epsu-stale-user-content-cleanup'::text)
    ) as jobs(job_name)
  )
  select
    expected.job_name,
    cron_job.schedule,
    run_details.start_time as last_run_started_at,
    run_details.end_time as last_run_finished_at,
    run_details.status as last_run_status,
    case
      when not public.is_platform_admin() then false
      when cron_job.jobid is null then false
      when run_details.status is null then false
      when run_details.status = 'succeeded' and run_details.start_time >= timezone('utc', now()) - interval '30 minutes' then true
      when run_details.status = 'running' and run_details.start_time >= timezone('utc', now()) - interval '30 minutes' then true
      else false
    end as is_healthy
  from expected_jobs expected
  left join cron.job cron_job
    on cron_job.jobname = expected.job_name
  left join lateral (
    select details.start_time, details.end_time, details.status
    from cron.job_run_details details
    where details.jobid = cron_job.jobid
    order by details.start_time desc
    limit 1
  ) run_details on true
  where public.is_platform_admin();
$$;

grant execute on function public.has_epsu_capability(uuid, text, uuid) to authenticated;
grant execute on function public.ensure_platform_admin_epsu_membership(uuid, uuid) to authenticated;
grant execute on function public.ensure_platform_admin_memberships(uuid) to authenticated;
grant execute on function public.fetch_background_job_health() to authenticated;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  related_epsu_id uuid references public.epsus (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz,
  push_sent_at timestamptz,
  push_error text,
  push_ticket_ids jsonb,
  push_receipts_checked_at timestamptz
);

create table if not exists public.app_runtime_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.request_push_delivery_for_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_secret text;
begin
  select secret.value
  into delivery_secret
  from public.app_runtime_secrets secret
  where secret.key = 'push_delivery_secret';

  if delivery_secret is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://xzgzzuxmtjrppavvynuy.supabase.co/functions/v1/send-push-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-epsu-push-secret', delivery_secret
    ),
    body := '{}'::jsonb
  );
end;
$$;

create or replace function public.trigger_push_delivery_for_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.request_push_delivery_for_notifications();
  return null;
end;
$$;

create or replace function public.purge_expired_moderation_actions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.moderation_actions
  where (
    action_type in ('dismiss_report', 'mute_author_24h', 'remove_post')
    and created_at <= timezone('utc', now()) - interval '24 hours'
  ) or (
    action_type in ('change_member_role', 'change_member_status', 'kick_school_member', 'redeem_invite')
    and created_at <= timezone('utc', now()) - interval '48 hours'
  );

  get diagnostics deleted_count = row_count;

  return jsonb_build_object('ok', true, 'deletedCount', deleted_count);
end;
$$;

create or replace function public.purge_stale_user_content()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_notification_count integer := 0;
  deleted_trial_submission_count integer := 0;
  deleted_report_count integer := 0;
  deleted_post_count integer := 0;
begin
  delete from public.app_notifications
  where (
    read_at is not null
    and created_at < timezone('utc', now()) - interval '30 days'
  ) or (
    created_at < timezone('utc', now()) - interval '90 days'
  );

  get diagnostics deleted_notification_count = row_count;

  delete from public.epsu_trial_submissions
  where (
    status in ('rejected', 'expired')
    and coalesce(reviewed_at, updated_at, created_at) < timezone('utc', now()) - interval '24 hours'
  ) or (
    status in ('approved', 'converted')
    and coalesce(approved_at, reviewed_at, updated_at, created_at) < timezone('utc', now()) - interval '7 days'
  );

  get diagnostics deleted_trial_submission_count = row_count;

  delete from public.post_reports
  where status in ('resolved', 'rejected')
    and coalesce(resolved_at, created_at) < timezone('utc', now()) - interval '30 days';

  get diagnostics deleted_report_count = row_count;

  delete from public.posts
  where status in ('expired', 'deleted_by_threshold', 'deleted_by_mod')
    and coalesce(expire_at, created_at) < timezone('utc', now()) - interval '30 days';

  get diagnostics deleted_post_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'deletedNotifications', deleted_notification_count,
    'deletedTrialSubmissions', deleted_trial_submission_count,
    'deletedReports', deleted_report_count,
    'deletedPosts', deleted_post_count
  );
end;
$$;

create or replace function public.release_queued_posts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
  auto_removed_count integer;
  resolved_at_now timestamptz;
  current_hour timestamptz;
begin
  resolved_at_now := timezone('utc', now());
  current_hour := date_trunc('hour', timezone('utc', now()));

  with auto_removed_posts as (
    update public.posts
    set status = 'deleted_by_mod'
    where status = 'queued'
      and keyword_reviewed_at is null
      and cardinality(coalesce(flagged_keywords, '{}'::text[])) > 0
      and release_at <= resolved_at_now
    returning id
  )
  update public.post_reports
  set status = 'resolved',
      resolved_at = resolved_at_now
  where post_id in (select id from auto_removed_posts)
    and status = 'open';

  get diagnostics auto_removed_count = row_count;

  update public.posts
  set status = 'active'
  where status = 'queued'
    and keyword_reviewed_at is not null
    and release_at <= resolved_at_now;

  get diagnostics released_count = row_count;

  if released_count > 0 then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    select distinct
      recipient.profile_id,
      'fullhour_post',
      'New Posts',
      'See them now!',
      null::uuid
    from (
      select membership.profile_id
      from public.epsu_memberships membership
      where membership.role in ('member', 'moderator', 'host')
        and membership.status = 'active'
      union
      select profile.id as profile_id
      from public.profiles profile
      where profile.is_admin = true
    ) recipient
    where not exists (
        select 1
        from public.app_notifications notification
        where notification.profile_id = recipient.profile_id
          and notification.kind = 'fullhour_post'
          and notification.created_at >= current_hour
          and notification.created_at < current_hour + interval '1 hour'
      );
  end if;

  return jsonb_build_object(
    'ok', true,
    'releasedCount', released_count,
    'autoRemovedCount', auto_removed_count
  );
end;
$$;

create or replace function public.fetch_all_queued_posts()
returns table (
  id uuid,
  epsu_id uuid,
  epsu_name text,
  number integer,
  title text,
  body text,
  author_id uuid,
  reply_to_post_id uuid,
  release_at timestamptz,
  created_at timestamptz,
  keyword_reviewed_at timestamptz,
  flagged_keywords text[]
)
language sql
security definer
set search_path = public
as $$
  select
    post_record.id,
    post_record.epsu_id,
    epsu.name as epsu_name,
    post_record.number,
    post_record.title,
    post_record.body,
    post_record.author_id,
    post_record.reply_to_post_id,
    post_record.release_at,
    post_record.created_at,
    post_record.keyword_reviewed_at,
    coalesce(post_record.flagged_keywords, '{}'::text[]) as flagged_keywords
  from public.posts post_record
  join public.epsus epsu on epsu.id = post_record.epsu_id
  where public.is_platform_admin()
    and post_record.status = 'queued'
    and (
      cardinality(coalesce(post_record.flagged_keywords, '{}'::text[])) = 0
      or post_record.keyword_reviewed_at is not null
    )
  order by post_record.release_at asc nulls last, post_record.created_at asc, epsu.name asc, post_record.number asc;
$$;

create or replace function public.release_queued_posts_now()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
  released_at_now timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Administrator access required';
  end if;

  released_at_now := timezone('utc', now());

  update public.posts
  set status = 'active',
      release_at = released_at_now,
      expire_at = released_at_now + interval '24 hours'
  where status = 'queued'
    and keyword_reviewed_at is not null;

  get diagnostics released_count = row_count;

  if released_count > 0 then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    select distinct
      recipient.profile_id,
      'fullhour_post',
      'New Posts',
      'See them now!',
      null::uuid
    from (
      select membership.profile_id
      from public.epsu_memberships membership
      where membership.role in ('member', 'moderator', 'host')
        and membership.status = 'active'
      union
      select profile.id as profile_id
      from public.profiles profile
      where profile.is_admin = true
    ) recipient;
  end if;

  return jsonb_build_object('ok', true, 'releasedCount', released_count);
end;
$$;

create table if not exists public.epsu_presence (
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default timezone('utc', now()),
  primary key (epsu_id, profile_id)
);

create table if not exists public.profile_push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android', 'web', 'unknown')),
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, expo_push_token)
);

create index if not exists idx_epsu_invites_epsu_role_active
  on public.epsu_invites (epsu_id, invite_role, is_active);

create index if not exists app_notifications_profile_kind_created_at_idx
  on public.app_notifications (profile_id, kind, created_at desc);

create index if not exists app_notifications_profile_unread_created_at_idx
  on public.app_notifications (profile_id, created_at desc)
  where read_at is null;

create index if not exists epsu_memberships_profile_status_role_epsu_idx
  on public.epsu_memberships (profile_id, status, role, epsu_id);

create index if not exists epsu_memberships_epsu_status_created_profile_idx
  on public.epsu_memberships (epsu_id, status, created_at asc, profile_id);

create index if not exists moderation_actions_epsu_created_at_idx
  on public.moderation_actions (epsu_id, created_at desc);

create index if not exists moderation_actions_actor_created_at_idx
  on public.moderation_actions (actor_profile_id, created_at desc)
  where actor_profile_id is not null;

create index if not exists moderation_actions_target_created_at_idx
  on public.moderation_actions (target_profile_id, created_at desc)
  where target_profile_id is not null;

create index if not exists post_reports_profile_created_at_idx
  on public.post_reports (profile_id, created_at desc);

create index if not exists posts_author_created_at_idx
  on public.posts (author_id, created_at desc)
  where author_id is not null;

create index if not exists epsus_host_created_at_idx
  on public.epsus (host_id, created_at desc)
  where host_id is not null;

create index if not exists idx_epsu_presence_last_seen_at
  on public.epsu_presence (last_seen_at desc);

create index if not exists profile_push_tokens_profile_enabled_idx
  on public.profile_push_tokens (profile_id, enabled);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute procedure public.set_updated_at();

drop trigger if exists set_epsus_updated_at on public.epsus;
create trigger set_epsus_updated_at
before update on public.epsus
for each row
execute procedure public.set_updated_at();

drop trigger if exists set_posts_updated_at on public.posts;
create trigger set_posts_updated_at
before update on public.posts
for each row
execute procedure public.set_updated_at();

insert into public.epsus (slug, name, code, scope, country_code)
values
  ('tallinn-epsu', 'Tallinn Epsu', 'TLN', 'city', 'EE'),
  ('tartu-epsu', 'Tartu Epsu', 'TRT', 'city', 'EE'),
  ('parnu-epsu', 'Parnu Epsu', 'PRN', 'city', 'EE'),
  ('narva-epsu', 'Narva Epsu', 'NRV', 'city', 'EE'),
  ('estonia-epsu', 'Estonia Epsu', 'EST', 'country', 'EE'),
  ('london-epsu', 'London Epsu', 'LDN', 'city', 'GB'),
  ('england-epsu', 'England Epsu', 'ENG', 'country', 'GB'),
  ('scotland-epsu', 'Scotland Epsu', 'SCT', 'country', 'GB')
on conflict (slug) do nothing;
