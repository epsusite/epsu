create or replace function public.is_epsu_host(target_epsu_id uuid, target_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(target_profile_id) or exists(
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = target_epsu_id
      and membership.profile_id = target_profile_id
      and membership.role = 'host'
      and membership.status in ('active', 'muted')
  ) or exists(
    select 1
    from public.epsus epsu
    where epsu.id = target_epsu_id
      and epsu.host_id = target_profile_id
  );
$$;

create or replace function public.is_epsu_moderator(target_epsu_id uuid, target_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(target_profile_id) or exists(
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = target_epsu_id
      and membership.profile_id = target_profile_id
      and membership.role in ('host', 'moderator')
      and membership.status in ('active', 'muted')
  ) or exists(
    select 1
    from public.epsus epsu
    where epsu.id = target_epsu_id
      and epsu.host_id = target_profile_id
  );
$$;

create or replace function public.create_epsu_post(
  p_epsu_id uuid,
  p_title text,
  p_body text,
  p_reply_to_post_id uuid default null,
  p_flagged_keywords text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_post_number integer;
  created_post public.posts%rowtype;
  reply_target public.posts%rowtype;
  next_release_at timestamptz;
  next_expire_at timestamptz;
  normalized_keywords text[];
  used_top_level_posts integer;
  used_replies integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform public.normalize_expired_mutes(auth.uid());

  if not public.can_view_epsu_feed(p_epsu_id) then
    raise exception 'Join this Epsu before posting.';
  end if;

  if p_reply_to_post_id is not null then
    select *
    into reply_target
    from public.posts post_record
    where post_record.id = p_reply_to_post_id
      and post_record.epsu_id = p_epsu_id
      and post_record.status = 'active';

    if not found then
      raise exception 'Replies are only available for released posts';
    end if;
  end if;

  if public.is_epsu_muted(p_epsu_id) then
    raise exception 'You have been muted for 24 hours. Until then, you cannot submit posts here.';
  end if;

  next_release_at := public.next_post_release_at(timezone('utc', now()));
  next_expire_at := next_release_at + interval '24 hours';
  normalized_keywords := coalesce(
    array(
      select distinct trim(keyword)
      from unnest(coalesce(p_flagged_keywords, '{}'::text[])) as keyword
      where trim(coalesce(keyword, '')) <> ''
      order by trim(keyword)
    ),
    '{}'::text[]
  );

  select
    count(*) filter (where post_record.reply_to_post_id is null)::integer,
    count(*) filter (where post_record.reply_to_post_id is not null)::integer
  into used_top_level_posts, used_replies
  from public.posts post_record
  where post_record.epsu_id = p_epsu_id
    and post_record.author_id = auth.uid()
    and post_record.release_at = next_release_at
    and post_record.status in ('queued', 'active');

  if p_reply_to_post_id is null and used_top_level_posts >= 2 then
    raise exception 'You can only post to Epsu 2 times per hour';
  end if;

  if p_reply_to_post_id is not null and used_replies >= 1 then
    raise exception 'You can only reply 1 time per hour in an Epsu';
  end if;

  select post_record.number
  into latest_post_number
  from public.posts post_record
  where post_record.epsu_id = p_epsu_id
  order by post_record.number desc
  limit 1
  for update;

  insert into public.posts (
    epsu_id,
    author_id,
    number,
    title,
    body,
    reply_to_post_id,
    status,
    release_at,
    expire_at,
    flagged_keywords,
    keyword_reviewed_at,
    keyword_reviewed_by_profile_id
  )
  values (
    p_epsu_id,
    auth.uid(),
    coalesce(latest_post_number, 0) + 1,
    p_title,
    p_body,
    p_reply_to_post_id,
    'queued',
    next_release_at,
    next_expire_at,
    normalized_keywords,
    case when cardinality(normalized_keywords) = 0 then timezone('utc', now()) else null end,
    null
  )
  returning * into created_post;

  return jsonb_build_object(
    'id', created_post.id,
    'epsuId', created_post.epsu_id,
    'authorId', created_post.author_id,
    'number', created_post.number,
    'title', created_post.title,
    'body', created_post.body,
    'replyToPostId', created_post.reply_to_post_id,
    'status', created_post.status,
    'releaseAt', created_post.release_at,
    'expireAt', created_post.expire_at,
    'flaggedKeywords', created_post.flagged_keywords
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
  epsu_member_count integer;
  participation_rate numeric;
  clamped_participation_rate numeric;
  required_dislike_ratio numeric;
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

  if not found or not public.can_view_epsu_feed(target_post.epsu_id) then
    raise exception 'Post not available';
  end if;

  perform public.normalize_expired_mutes(auth.uid());

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

  select count(*)
  into epsu_member_count
  from public.epsu_memberships
  where epsu_id = target_post.epsu_id
    and status in ('active', 'muted');

  participation_rate := total_reactions::numeric / greatest(epsu_member_count, 1);
  clamped_participation_rate := least(1.0, greatest(0.10, participation_rate));
  required_dislike_ratio := 0.80 + (0.51 - 0.80) * ((clamped_participation_rate - 0.10) / 0.90);
  should_delete := next_dislike_count::numeric / total_reactions >= required_dislike_ratio;

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
