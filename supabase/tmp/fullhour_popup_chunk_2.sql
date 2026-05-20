create or replace function public.mark_app_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_kind text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select notification.kind
  into target_kind
  from public.app_notifications notification
  where notification.id = p_notification_id
    and notification.profile_id = auth.uid()
    and notification.read_at is null;

  if target_kind = 'fullhour_post' then
    update public.app_notifications
    set read_at = timezone('utc', now())
    where profile_id = auth.uid()
      and kind = 'fullhour_post'
      and read_at is null;
  else
    update public.app_notifications
    set read_at = timezone('utc', now())
    where id = p_notification_id
      and profile_id = auth.uid()
      and read_at is null;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
