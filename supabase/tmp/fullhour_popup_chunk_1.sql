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
