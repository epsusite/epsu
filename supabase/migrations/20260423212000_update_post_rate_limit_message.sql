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

  if exists (
    select 1
    from public.posts post_record
    where post_record.epsu_id = p_epsu_id
      and post_record.author_id = auth.uid()
      and post_record.release_at = next_release_at
      and post_record.status in ('queued', 'active')
  ) then
    raise exception 'You can only post to Epsu''s one time per hour';
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
