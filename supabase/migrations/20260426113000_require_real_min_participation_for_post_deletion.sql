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

  select count(*)
  into epsu_member_count
  from public.epsu_memberships
  where epsu_id = target_post.epsu_id
    and status in ('active', 'muted');

  participation_rate := total_reactions::numeric / greatest(epsu_member_count, 1);

  if participation_rate < 0.10 then
    should_delete := false;
  else
    clamped_participation_rate := least(1.0, participation_rate);
    required_dislike_ratio := 0.80 + (0.51 - 0.80) * ((clamped_participation_rate - 0.10) / 0.90);
    should_delete := next_dislike_count::numeric / total_reactions >= required_dislike_ratio;
  end if;

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
