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
    where jobname = 'epsu-expired-post-cleanup';

    perform cron.schedule(
      'epsu-expired-post-cleanup',
      '*/10 * * * *',
      $sql$select public.delete_expired_posts();$sql$
    );
  end if;
end;
$job$;
