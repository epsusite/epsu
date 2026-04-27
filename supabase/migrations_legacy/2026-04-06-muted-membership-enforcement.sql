alter table public.epsu_memberships
  add column if not exists muted_until timestamptz;

update public.epsu_memberships
set muted_until = timezone('utc', now()) + interval '24 hours'
where status = 'muted'
  and muted_until is null;

create or replace function public.normalize_expired_mutes(p_profile_id uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.epsu_memberships
  set status = 'active',
      muted_until = null
  where status = 'muted'
    and muted_until is not null
    and muted_until <= timezone('utc', now())
    and (
      p_profile_id is null
      or profile_id = p_profile_id
    );
end;
$$;

create or replace function public.is_epsu_muted(
  target_epsu_id uuid,
  target_profile_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = target_epsu_id
      and membership.profile_id = target_profile_id
      and membership.status = 'muted'
      and (
        membership.muted_until is null
        or membership.muted_until > timezone('utc', now())
      )
  );
$$;

create or replace function public.create_epsu_post(
  p_epsu_id uuid,
  p_title text,
  p_body text,
  p_reply_to_post_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_post_number integer;
  created_post public.posts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform public.normalize_expired_mutes(auth.uid());

  if public.is_epsu_muted(p_epsu_id) then
    raise exception 'You have been muted for 24 hours. Until then, you can''t post or rate here.';
  end if;

  select post_record.number
  into latest_post_number
  from public.posts post_record
  where post_record.epsu_id = p_epsu_id
  order by post_record.number desc
  limit 1
  for update;

  insert into public.posts (epsu_id, author_id, number, title, body, reply_to_post_id)
  values (
    p_epsu_id,
    auth.uid(),
    coalesce(latest_post_number, 0) + 1,
    p_title,
    p_body,
    p_reply_to_post_id
  )
  returning * into created_post;

  return jsonb_build_object(
    'id', created_post.id,
    'epsuId', created_post.epsu_id,
    'authorId', created_post.author_id,
    'number', created_post.number,
    'title', created_post.title,
    'body', created_post.body,
    'likeCount', created_post.like_count,
    'dislikeCount', created_post.dislike_count,
    'replyToPostId', created_post.reply_to_post_id
  );
end;
$$;

create or replace function public.react_to_post(p_post_id uuid, p_reaction text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post public.posts%rowtype;
  next_like_count integer;
  next_dislike_count integer;
  total_reactions integer;
  should_delete boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_reaction not in ('like', 'dislike') then
    raise exception 'Invalid reaction';
  end if;

  select *
  into target_post
  from public.posts
  where id = p_post_id
    and status = 'active'
  for update;

  if not found or not public.can_access_epsu(target_post.epsu_id) then
    raise exception 'Post not available';
  end if;

  perform public.normalize_expired_mutes(auth.uid());

  if public.is_epsu_muted(target_post.epsu_id) then
    raise exception 'You have been muted for 24 hours. Until then, you can''t post or rate here.';
  end if;

  begin
    insert into public.post_reactions (post_id, profile_id, reaction)
    values (p_post_id, auth.uid(), p_reaction);
  exception
    when unique_violation then
      return jsonb_build_object('duplicate', true);
  end;

  next_like_count := target_post.like_count + case when p_reaction = 'like' then 1 else 0 end;
  next_dislike_count := target_post.dislike_count + case when p_reaction = 'dislike' then 1 else 0 end;
  total_reactions := next_like_count + next_dislike_count;
  should_delete := total_reactions >= 100 and next_dislike_count::numeric / total_reactions >= 0.6;

  update public.posts
  set like_count = next_like_count,
      dislike_count = next_dislike_count,
      status = case when should_delete then 'deleted_by_threshold' else status end
  where id = p_post_id;

  return jsonb_build_object(
    'duplicate', false,
    'deleted', should_delete,
    'likeCount', next_like_count,
    'dislikeCount', next_dislike_count
  );
end;
$$;

create or replace function public.mute_epsu_member(p_profile_id uuid, p_epsu_id uuid, p_post_id uuid)
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

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type)
  values (auth.uid(), p_profile_id, p_epsu_id, p_post_id, 'mute_author_24h');

  return jsonb_build_object('ok', true, 'muteUntil', mute_until);
end;
$$;

grant execute on function public.normalize_expired_mutes(uuid) to authenticated;
grant execute on function public.is_epsu_muted(uuid, uuid) to authenticated;
grant execute on function public.create_epsu_post(uuid, text, text, uuid) to authenticated;
