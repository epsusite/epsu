create or replace function public.release_queued_posts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
  current_hour timestamptz;
begin
  current_hour := date_trunc('hour', timezone('utc', now()));

  update public.posts
  set status = 'active'
  where status = 'queued'
    and keyword_reviewed_at is not null
    and release_at <= timezone('utc', now());

  get diagnostics released_count = row_count;

  if released_count > 0 then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    select distinct
      membership.profile_id,
      'fullhour_post',
      'New Posts',
      'See them now!',
      null::uuid
    from public.epsu_memberships membership
    where membership.role in ('member', 'moderator', 'host')
      and membership.status = 'active'
      and not exists (
        select 1
        from public.app_notifications notification
        where notification.profile_id = membership.profile_id
          and notification.kind = 'fullhour_post'
          and notification.created_at >= current_hour
          and notification.created_at < current_hour + interval '1 hour'
      );
  end if;

  return jsonb_build_object('ok', true, 'releasedCount', released_count);
end;
$$;
