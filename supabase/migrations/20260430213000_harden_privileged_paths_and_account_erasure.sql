alter table public.post_reports
add column if not exists resolved_at timestamptz;

update public.post_reports
set resolved_at = coalesce(resolved_at, created_at)
where status in ('resolved', 'rejected');

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

create or replace function public.dismiss_epsu_report(p_post_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post public.posts%rowtype;
  resolved_at_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_post
  from public.posts
  where id = p_post_id;

  if not found or not public.has_epsu_capability(target_post.epsu_id, 'moderate') then
    raise exception 'Moderator access required';
  end if;

  update public.post_reports
  set status = 'rejected',
      resolved_at = resolved_at_now
  where post_id = p_post_id
    and status = 'open';

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type, details)
  values (
    auth.uid(),
    target_post.author_id,
    target_post.epsu_id,
    p_post_id,
    'dismiss_report',
    '{}'::jsonb
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.remove_epsu_post(p_post_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post public.posts%rowtype;
  normalized_reason text;
  resolved_at_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_post
  from public.posts
  where id = p_post_id;

  if not found or not public.has_epsu_capability(target_post.epsu_id, 'moderate') then
    raise exception 'Moderator access required';
  end if;

  normalized_reason := nullif(trim(coalesce(p_reason, '')), '');

  update public.posts
  set status = 'deleted_by_mod'
  where id = p_post_id;

  update public.post_reports
  set status = 'resolved',
      resolved_at = resolved_at_now
  where post_id = p_post_id
    and status = 'open';

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type, details)
  values (
    auth.uid(),
    target_post.author_id,
    target_post.epsu_id,
    p_post_id,
    'remove_post',
    jsonb_strip_nulls(jsonb_build_object('reason', normalized_reason))
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mute_epsu_member(p_profile_id uuid, p_epsu_id uuid, p_post_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mute_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_epsu_capability(p_epsu_id, 'moderate') then
    raise exception 'Moderator access required';
  end if;

  if p_profile_id is null then
    raise exception 'Post author could not be identified';
  end if;

  if not exists (
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = p_epsu_id
      and membership.profile_id = p_profile_id
      and membership.status in ('active', 'muted')
  ) then
    raise exception 'Author is not an active member of this Epsu';
  end if;

  mute_until := timezone('utc', now()) + interval '24 hours';

  update public.epsu_memberships
  set status = 'muted',
      muted_until = mute_until
  where epsu_id = p_epsu_id
    and profile_id = p_profile_id
    and status in ('active', 'muted');

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type, details)
  values (
    auth.uid(),
    p_profile_id,
    p_epsu_id,
    p_post_id,
    'mute_author_24h',
    '{}'::jsonb
  );

  return jsonb_build_object('ok', true, 'muteUntil', mute_until);
end;
$$;

create or replace function public.fetch_flagged_queued_posts(p_epsu_id uuid)
returns table (
  id uuid,
  epsu_id uuid,
  author_id uuid,
  number integer,
  title text,
  body text,
  reply_to_post_id uuid,
  flagged_keywords text[],
  release_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    post_record.id,
    post_record.epsu_id,
    post_record.author_id,
    post_record.number,
    post_record.title,
    post_record.body,
    post_record.reply_to_post_id,
    post_record.flagged_keywords,
    post_record.release_at,
    post_record.created_at
  from public.posts post_record
  where post_record.epsu_id = p_epsu_id
    and post_record.status = 'queued'
    and cardinality(post_record.flagged_keywords) > 0
    and post_record.keyword_reviewed_at is null
    and public.has_epsu_capability(p_epsu_id, 'moderate');
$$;

create or replace function public.mark_queued_post_reviewed(p_post_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post public.posts%rowtype;
  normalized_reason text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_post
  from public.posts
  where id = p_post_id
    and status = 'queued';

  if not found or not public.has_epsu_capability(target_post.epsu_id, 'moderate') then
    raise exception 'Moderator access required';
  end if;

  normalized_reason := nullif(trim(coalesce(p_reason, '')), '');

  update public.posts
  set keyword_reviewed_at = timezone('utc', now()),
      keyword_reviewed_by_profile_id = auth.uid()
  where id = p_post_id;

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type, details)
  values (
    auth.uid(),
    target_post.author_id,
    target_post.epsu_id,
    p_post_id,
    'dismiss_report',
    jsonb_strip_nulls(jsonb_build_object('reason', normalized_reason, 'source', 'keyword_filter'))
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.kick_school_epsu_member(p_epsu_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_epsu_capability(p_epsu_id, 'host') then
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
  delete from public.epsu_memberships where profile_id = current_user_id;
  delete from public.epsu_suggestions where profile_id = current_user_id;
  delete from public.epsu_trial_submissions where profile_id = current_user_id;
  delete from public.profile_blocks where blocker_profile_id = current_user_id or blocked_profile_id = current_user_id;
  delete from public.profile_push_tokens where profile_id = current_user_id;
  delete from public.epsu_presence where profile_id = current_user_id;
  delete from public.password_fingerprints where profile_id = current_user_id;
  delete from public.moderation_actions where actor_profile_id = current_user_id or target_profile_id = current_user_id;
  delete from public.posts where author_id = current_user_id;

  delete from auth.users
  where id = current_user_id;

  return jsonb_build_object('ok', true);
end;
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
grant execute on function public.fetch_background_job_health() to authenticated;
