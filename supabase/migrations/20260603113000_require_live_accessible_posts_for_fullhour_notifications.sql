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
  released_epsu_ids uuid[];
begin
  resolved_at_now := timezone('utc', now());
  current_hour := date_trunc('hour', resolved_at_now);

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

  with released_posts as (
    update public.posts
    set status = 'active'
    where status = 'queued'
      and keyword_reviewed_at is not null
      and release_at <= resolved_at_now
    returning epsu_id
  )
  select
    count(*)::int,
    coalesce(array_agg(distinct epsu_id), '{}'::uuid[])
  into released_count, released_epsu_ids
  from released_posts;

  if released_count > 0 then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    select distinct
      membership.profile_id,
      'fullhour_post',
      'New Posts',
      'See them now!',
      null::uuid
    from public.epsu_memberships membership
    where membership.status = 'active'
      and membership.role in ('member', 'moderator', 'host')
      and membership.epsu_id = any(released_epsu_ids)
      and not exists (
        select 1
        from public.app_notifications notification
        where notification.profile_id = membership.profile_id
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
  released_epsu_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Administrator access required';
  end if;

  released_at_now := timezone('utc', now());

  with released_posts as (
    update public.posts
    set status = 'active',
        release_at = released_at_now,
        expire_at = released_at_now + interval '24 hours'
    where status = 'queued'
      and keyword_reviewed_at is not null
    returning epsu_id
  )
  select
    count(*)::int,
    coalesce(array_agg(distinct epsu_id), '{}'::uuid[])
  into released_count, released_epsu_ids
  from released_posts;

  if released_count > 0 then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    select distinct
      membership.profile_id,
      'fullhour_post',
      'New Posts',
      'See them now!',
      null::uuid
    from public.epsu_memberships membership
    where membership.status = 'active'
      and membership.role in ('member', 'moderator', 'host')
      and membership.epsu_id = any(released_epsu_ids);
  end if;

  return jsonb_build_object('ok', true, 'releasedCount', released_count);
end;
$$;

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
  with fullhour_visibility as (
    select exists (
      select 1
      from public.posts post
      join public.epsu_memberships membership
        on membership.epsu_id = post.epsu_id
       and membership.profile_id = auth.uid()
       and membership.status = 'active'
       and membership.role in ('member', 'moderator', 'host')
      where post.status = 'active'
    ) as has_visible_active_posts
  ),
  latest_fullhour as (
    select notification.id
    from public.app_notifications notification
    cross join fullhour_visibility visibility
    where notification.profile_id = auth.uid()
      and notification.read_at is null
      and notification.kind = 'fullhour_post'
      and visibility.has_visible_active_posts
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
  cross join fullhour_visibility visibility
  where notification.profile_id = auth.uid()
    and notification.read_at is null
    and notification.kind <> 'post_removed_silent'
    and (
      notification.kind <> 'fullhour_post'
      or (
        visibility.has_visible_active_posts
        and notification.id in (select id from latest_fullhour)
      )
    )
    and (
      notification.kind in ('post_removed', 'author_muted')
      or notification.related_epsu_id is null
      or epsu.scope not in ('country', 'state', 'city')
      or epsu.country_code = profile.country_code
    )
  order by notification.created_at asc;
$$;

delete from public.app_notifications notification
where notification.kind = 'fullhour_post'
  and notification.read_at is null
  and not exists (
    select 1
    from public.posts post
    join public.epsu_memberships membership
      on membership.epsu_id = post.epsu_id
     and membership.profile_id = notification.profile_id
     and membership.status = 'active'
     and membership.role in ('member', 'moderator', 'host')
    where post.status = 'active'
  );
