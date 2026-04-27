create table if not exists public.app_runtime_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

revoke all on public.app_runtime_secrets from anon, authenticated;

create or replace function public.trigger_push_delivery_for_notifications()
returns trigger
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
    return null;
  end if;

  perform net.http_post(
    url := 'https://xzgzzuxmtjrppavvynuy.supabase.co/functions/v1/send-push-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-epsu-push-secret', delivery_secret
    ),
    body := '{}'::jsonb
  );

  return null;
end;
$$;
