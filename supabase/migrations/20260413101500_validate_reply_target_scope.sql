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
  reply_target_epsu_id uuid;
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
    select post_record.epsu_id
    into reply_target_epsu_id
    from public.posts post_record
    where post_record.id = p_reply_to_post_id;

    if not found then
      raise exception 'Reply target not available';
    end if;

    if reply_target_epsu_id <> p_epsu_id then
      raise exception 'Reply target belongs to a different Epsu';
    end if;
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

  if created_post.reply_to_post_id = created_post.id then
    raise exception 'A post cannot reply to itself';
  end if;

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

grant execute on function public.create_epsu_post(uuid, text, text, uuid) to authenticated;
