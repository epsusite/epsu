create or replace function public.fetch_epsu_post_quota(
  p_epsu_id uuid,
  p_now timestamptz default timezone('utc', now())
)
returns table (
  posts_left integer,
  replies_left integer,
  resets_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with next_slot as (
    select public.next_post_release_at(p_now) as release_at
  ),
  usage_counts as (
    select
      count(*) filter (
        where post_record.reply_to_post_id is null
      )::integer as used_posts,
      count(*) filter (
        where post_record.reply_to_post_id is not null
      )::integer as used_replies
    from public.posts post_record
    cross join next_slot
    where post_record.epsu_id = p_epsu_id
      and post_record.author_id = auth.uid()
      and post_record.release_at = next_slot.release_at
      and post_record.status in ('queued', 'active')
  )
  select
    greatest(0, 2 - usage_counts.used_posts) as posts_left,
    greatest(0, 1 - usage_counts.used_replies) as replies_left,
    next_slot.release_at as resets_at
  from usage_counts
  cross join next_slot;
$$;

grant execute on function public.fetch_epsu_post_quota(uuid, timestamptz) to authenticated;

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

  if public.is_epsu_muted(p_epsu_id) then
    raise exception 'You have been muted for 24 hours. Until then, you can''t post or rate here.';
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
