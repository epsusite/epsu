create or replace function public.mark_queued_post_reviewed(p_post_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post public.posts%rowtype;
  normalized_reason text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_post
  from public.posts
  where id = p_post_id;

  if not found then
    raise exception 'Post not found';
  end if;

  if not public.has_epsu_capability(target_post.epsu_id, 'moderate') then
    raise exception 'Moderator access required';
  end if;

  if target_post.status not in ('queued', 'deleted_by_mod') then
    return jsonb_build_object(
      'ok', true,
      'alreadyHandled', true,
      'message', 'Post no longer requires keyword-review dismissal'
    );
  end if;

  if target_post.keyword_reviewed_at is not null then
    return jsonb_build_object(
      'ok', true,
      'alreadyHandled', true,
      'message', 'Post was already reviewed'
    );
  end if;

  normalized_reason := nullif(trim(coalesce(p_reason, '')), '');

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
    jsonb_strip_nulls(jsonb_build_object('reason', normalized_reason, 'source', 'keyword_filter'))
  );

  return jsonb_build_object('ok', true);
end;
$$;
