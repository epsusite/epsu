create extension if not exists pg_cron;

create or replace function public.run_hourly_post_cycle()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  release_result jsonb;
  delete_result jsonb;
begin
  release_result := public.release_queued_posts();
  delete_result := public.delete_expired_posts();

  return jsonb_build_object(
    'ok', true,
    'release', coalesce(release_result, '{}'::jsonb),
    'delete', coalesce(delete_result, '{}'::jsonb)
  );
end;
$$;

do $job$
begin
  if exists (
    select 1
    from pg_namespace
    where nspname = 'cron'
  ) then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'epsu-hourly-post-cycle';

    perform cron.schedule(
      'epsu-hourly-post-cycle',
      '0 * * * *',
      $sql$select public.run_hourly_post_cycle();$sql$
    );
  end if;
end;
$job$;

grant execute on function public.run_hourly_post_cycle() to authenticated;
