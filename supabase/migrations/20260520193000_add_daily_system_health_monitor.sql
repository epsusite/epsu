create table if not exists public.system_health_checks (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('ok', 'failed')),
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists system_health_checks_created_at_idx
  on public.system_health_checks (created_at desc);

create index if not exists system_health_checks_status_created_at_idx
  on public.system_health_checks (status, created_at desc);

create extension if not exists pg_net;

create or replace function public.request_daily_system_health_check()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  check_secret text;
begin
  select secret.value
  into check_secret
  from public.app_runtime_secrets secret
  where secret.key = 'system_health_check_secret';

  if check_secret is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://xzgzzuxmtjrppavvynuy.supabase.co/functions/v1/daily-system-health-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-epsu-system-health-secret', check_secret
    ),
    body := '{}'::jsonb
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
    where jobname = 'epsu-daily-system-health-check';

    perform cron.schedule(
      'epsu-daily-system-health-check',
      '17 */6 * * *',
      $sql$select public.request_daily_system_health_check();$sql$
    );
  end if;
end;
$job$;
