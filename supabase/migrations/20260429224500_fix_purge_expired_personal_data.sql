create or replace function public.purge_expired_personal_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_notification_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  delete from public.app_notifications
  where profile_id = auth.uid()
    and read_at is not null
    and created_at < timezone('utc', now()) - interval '365 days';

  get diagnostics deleted_notification_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'deletedNotifications', deleted_notification_count,
    'deletedRequests', 0
  );
end;
$$;

grant execute on function public.purge_expired_personal_data() to authenticated;
