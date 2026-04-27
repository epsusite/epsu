create or replace function public.notify_flagged_post_to_moderators(p_post_id uuid, p_epsu_id uuid, p_keywords text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post public.posts%rowtype;
  notification_title text;
  notification_body text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_post
  from public.posts
  where id = p_post_id
    and epsu_id = p_epsu_id;

  if not found then
    raise exception 'Post not found';
  end if;

  if target_post.author_id is distinct from auth.uid() then
    raise exception 'Only the post author can trigger this alert';
  end if;

  notification_title := 'Flagged post posted anyway';
  notification_body := format(
    'Post #%s was submitted after a keyword warning. Keywords: %s',
    coalesce(target_post.number::text, '?'),
    array_to_string(coalesce(p_keywords, array[]::text[]), ', ')
  );

  insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
  select distinct recipient.profile_id, 'flagged_post', notification_title, notification_body, p_epsu_id
  from (
    select membership.profile_id
    from public.epsu_memberships membership
    where membership.epsu_id = p_epsu_id
      and membership.role in ('owner', 'moderator')
      and membership.status = 'active'

    union

    select epsu.owner_id
    from public.epsus epsu
    where epsu.id = p_epsu_id
      and epsu.owner_id is not null
  ) as recipient
  where recipient.profile_id <> auth.uid();

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.notify_flagged_post_to_moderators(uuid, uuid, text[]) to authenticated;
