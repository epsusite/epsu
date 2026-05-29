drop function if exists public.remove_epsu_post(uuid, text);

create function public.remove_epsu_post(
  p_post_id uuid,
  p_reason text default null,
  p_notify_author boolean default true
)
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
    jsonb_strip_nulls(jsonb_build_object('reason', normalized_reason, 'notifiedAuthor', p_notify_author))
  );

  if p_notify_author and target_post.author_id is not null then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    values (
      target_post.author_id,
      'post_removed',
      'Post removed',
      case
        when normalized_reason is not null then format('Your post was removed by a moderator Reason: %s', normalized_reason)
        else 'Your post was removed by a moderator'
      end,
      target_post.epsu_id
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.remove_epsu_post(uuid, text, boolean) to authenticated;
