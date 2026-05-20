create or replace function public.release_queued_posts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
  auto_removed_count integer;
  resolved_at_now timestamptz;
  current_hour timestamptz;
begin
  resolved_at_now := timezone('utc', now());
  current_hour := date_trunc('hour', timezone('utc', now()));

  with auto_removed_posts as (
    update public.posts
    set status = 'deleted_by_mod'
    where status = 'queued'
      and keyword_reviewed_at is null
      and cardinality(coalesce(flagged_keywords, '{}'::text[])) > 0
      and release_at <= resolved_at_now
    returning id
  )
  update public.post_reports
  set status = 'resolved',
      resolved_at = resolved_at_now
  where post_id in (select id from auto_removed_posts)
    and status = 'open';

  get diagnostics auto_removed_count = row_count;

  update public.posts
  set status = 'active'
  where status = 'queued'
    and keyword_reviewed_at is not null
    and release_at <= resolved_at_now;

  get diagnostics released_count = row_count;

  if released_count > 0 then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    select distinct
      recipient.profile_id,
      'fullhour_post',
      'New Posts',
      'See them now!',
      null::uuid
    from (
      select membership.profile_id
      from public.epsu_memberships membership
      where membership.role in ('member', 'moderator', 'host')
        and membership.status = 'active'
      union
      select profile.id as profile_id
      from public.profiles profile
      where profile.is_admin = true
    ) recipient
    where not exists (
      select 1
      from public.app_notifications notification
      where notification.profile_id = recipient.profile_id
        and notification.kind = 'fullhour_post'
        and notification.created_at >= current_hour
        and notification.created_at < current_hour + interval '1 hour'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'releasedCount', released_count,
    'autoRemovedCount', auto_removed_count
  );
end;
$$;

create or replace function public.release_queued_posts_now()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
  released_at_now timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Administrator access required';
  end if;

  released_at_now := timezone('utc', now());

  update public.posts
  set status = 'active',
      release_at = released_at_now,
      expire_at = released_at_now + interval '24 hours'
  where status = 'queued'
    and keyword_reviewed_at is not null;

  get diagnostics released_count = row_count;

  if released_count > 0 then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    select distinct
      recipient.profile_id,
      'fullhour_post',
      'New Posts',
      'See them now!',
      null::uuid
    from (
      select membership.profile_id
      from public.epsu_memberships membership
      where membership.role in ('member', 'moderator', 'host')
        and membership.status = 'active'
      union
      select profile.id as profile_id
      from public.profiles profile
      where profile.is_admin = true
    ) recipient;
  end if;

  return jsonb_build_object('ok', true, 'releasedCount', released_count);
end;
$$;
