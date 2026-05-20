create or replace function public.remove_epsu_post(p_post_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post public.posts%rowtype;
  normalized_reason text;
  notification_body text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_post
  from public.posts
  where id = p_post_id;

  if not found or not public.has_epsu_capability(target_post.epsu_id, 'moderate') then
    raise exception 'Moderator access required';
  end if;

  normalized_reason := nullif(trim(coalesce(p_reason, '')), '');

  update public.posts
  set status = 'deleted_by_mod'
  where id = p_post_id;

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type, details)
  values (
    auth.uid(),
    target_post.author_id,
    target_post.epsu_id,
    p_post_id,
    'remove_post',
    jsonb_strip_nulls(jsonb_build_object('reason', normalized_reason))
  );

  notification_body := concat_ws(
    E'\n\n',
    case
      when normalized_reason is not null then format('Your post was removed by a moderator Reason: %s', normalized_reason)
      else 'Your post was removed by a moderator'
    end,
    nullif(trim(concat_ws(E'\n', nullif(trim(coalesce(target_post.title, '')), ''), nullif(trim(coalesce(target_post.body, '')), ''))), '')
  );

  if target_post.author_id is not null then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    values (
      target_post.author_id,
      'post_removed',
      'Post removed',
      notification_body,
      target_post.epsu_id
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mute_epsu_member(p_profile_id uuid, p_epsu_id uuid, p_post_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mute_until timestamptz;
  normalized_reason text;
  target_post public.posts%rowtype;
  notification_body text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_epsu_capability(p_epsu_id, 'moderate') then
    raise exception 'Moderator access required';
  end if;

  if p_profile_id is null then
    raise exception 'Post author could not be identified';
  end if;

  perform public.ensure_platform_admin_epsu_membership(p_epsu_id, p_profile_id);

  if not exists (
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = p_epsu_id
      and membership.profile_id = p_profile_id
      and membership.status in ('active', 'muted')
  ) then
    raise exception 'Author is not an active member of this Epsu';
  end if;

  select *
  into target_post
  from public.posts
  where id = p_post_id;

  normalized_reason := nullif(trim(coalesce(p_reason, '')), '');
  mute_until := timezone('utc', now()) + interval '24 hours';

  update public.epsu_memberships
  set status = 'muted',
      muted_until = mute_until
  where epsu_id = p_epsu_id
    and profile_id = p_profile_id
    and status in ('active', 'muted');

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type, details)
  values (
    auth.uid(),
    p_profile_id,
    p_epsu_id,
    p_post_id,
    'mute_author_24h',
    jsonb_strip_nulls(jsonb_build_object('reason', normalized_reason))
  );

  notification_body := concat_ws(
    E'\n\n',
    case
      when normalized_reason is not null then format('A moderator muted you for 24 hours Reason: %s', normalized_reason)
      else 'A moderator muted you for 24 hours'
    end,
    nullif(trim(concat_ws(E'\n', nullif(trim(coalesce(target_post.title, '')), ''), nullif(trim(coalesce(target_post.body, '')), ''))), '')
  );

  insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
  values (
    p_profile_id,
    'author_muted',
    'Muted for 24 hours',
    notification_body,
    p_epsu_id
  );

  return jsonb_build_object('ok', true, 'muteUntil', mute_until);
end;
$$;
