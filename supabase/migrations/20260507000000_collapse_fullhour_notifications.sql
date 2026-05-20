create or replace function public.fetch_unread_app_notifications()
returns table (
  id uuid,
  kind text,
  title text,
  body text,
  related_epsu_id uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with latest_fullhour as (
    select notification.id
    from public.app_notifications notification
    where notification.profile_id = auth.uid()
      and notification.read_at is null
      and notification.kind = 'fullhour_post'
    order by notification.created_at desc, notification.id desc
    limit 1
  )
  select
    notification.id,
    notification.kind,
    notification.title,
    notification.body,
    notification.related_epsu_id,
    notification.created_at
  from public.app_notifications notification
  left join public.epsus epsu on epsu.id = notification.related_epsu_id
  left join public.profiles profile on profile.id = auth.uid()
  where notification.profile_id = auth.uid()
    and notification.read_at is null
    and (
      notification.kind <> 'fullhour_post'
      or notification.id in (select id from latest_fullhour)
    )
    and (
      notification.kind in ('post_removed', 'author_muted')
      or notification.related_epsu_id is null
      or epsu.scope not in ('country', 'state', 'city')
      or epsu.country_code = profile.country_code
    )
  order by notification.created_at asc;
$$;

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
