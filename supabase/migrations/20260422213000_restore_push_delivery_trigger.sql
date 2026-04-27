create extension if not exists pg_net;

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

drop trigger if exists app_notifications_auto_push_delivery on public.app_notifications;
create trigger app_notifications_auto_push_delivery
after insert on public.app_notifications
for each statement
execute function public.trigger_push_delivery_for_notifications();

select public.request_push_delivery_for_notifications();
