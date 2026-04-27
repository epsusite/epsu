update public.moderation_actions
set details = coalesce(details, '{}'::jsonb) - 'reason'
where details ? 'reason';

alter table public.post_reports
drop column if exists reason;

create or replace function public.dismiss_epsu_report(p_post_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post public.posts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_post
  from public.posts
  where id = p_post_id;

  if not found or not public.is_epsu_moderator(target_post.epsu_id) then
    raise exception 'Moderator access required';
  end if;

  update public.post_reports
  set status = 'rejected'
  where post_id = p_post_id
    and status = 'open';

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type, details)
  values (
    auth.uid(),
    target_post.author_id,
    target_post.epsu_id,
    p_post_id,
    'dismiss_report',
    '{}'::jsonb
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.remove_epsu_post(p_post_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post public.posts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_post
  from public.posts
  where id = p_post_id;

  if not found or not public.is_epsu_moderator(target_post.epsu_id) then
    raise exception 'Moderator access required';
  end if;

  update public.posts
  set status = 'deleted_by_mod'
  where id = p_post_id;

  update public.post_reports
  set status = 'resolved'
  where post_id = p_post_id
    and status = 'open';

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type, details)
  values (
    auth.uid(),
    target_post.author_id,
    target_post.epsu_id,
    p_post_id,
    'remove_post',
    '{}'::jsonb
  );

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
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_epsu_moderator(p_epsu_id) then
    raise exception 'Moderator access required';
  end if;

  if exists (
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = p_epsu_id
      and membership.profile_id = p_profile_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise exception 'Owners cannot be muted';
  end if;

  mute_until := timezone('utc', now()) + interval '24 hours';

  update public.epsu_memberships
  set status = 'muted',
      muted_until = mute_until
  where epsu_id = p_epsu_id
    and profile_id = p_profile_id;

  update public.post_reports
  set status = 'resolved'
  where post_id = p_post_id
    and status = 'open';

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type, details)
  values (
    auth.uid(),
    p_profile_id,
    p_epsu_id,
    p_post_id,
    'mute_author_24h',
    '{}'::jsonb
  );

  return jsonb_build_object('ok', true, 'muteUntil', mute_until);
end;
$$;

create or replace function public.mark_queued_post_reviewed(p_post_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post public.posts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_post
  from public.posts
  where id = p_post_id
    and status = 'queued';

  if not found or not public.is_epsu_moderator(target_post.epsu_id) then
    raise exception 'Moderator access required';
  end if;

  update public.posts
  set keyword_reviewed_at = timezone('utc', now()),
      keyword_reviewed_by_profile_id = auth.uid()
  where id = p_post_id;

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type, details)
  values (
    auth.uid(),
    target_post.author_id,
    target_post.epsu_id,
    p_post_id,
    'dismiss_report',
    jsonb_build_object('source', 'keyword_filter')
  );

  return jsonb_build_object('ok', true);
end;
$$;
