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
    and created_at < timezone('utc', now()) - interval '30 days';

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

create extension if not exists pg_cron;

do $job$
begin
  if exists (
    select 1
    from pg_namespace
    where nspname = 'cron'
  ) then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'epsu-stale-user-content-cleanup';

    perform cron.schedule(
      'epsu-stale-user-content-cleanup',
      '*/10 * * * *',
      $sql$select public.purge_stale_user_content();$sql$
    );
  end if;
end;
$job$;

