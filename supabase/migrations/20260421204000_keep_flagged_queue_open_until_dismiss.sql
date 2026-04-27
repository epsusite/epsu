create or replace function public.fetch_flagged_queued_posts(p_epsu_id uuid)
returns table (
  id uuid,
  epsu_id uuid,
  author_id uuid,
  number integer,
  title text,
  body text,
  reply_to_post_id uuid,
  flagged_keywords text[],
  release_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    post_record.id,
    post_record.epsu_id,
    post_record.author_id,
    post_record.number,
    post_record.title,
    post_record.body,
    post_record.reply_to_post_id,
    post_record.flagged_keywords,
    post_record.release_at,
    post_record.created_at
  from public.posts post_record
  where post_record.epsu_id = p_epsu_id
    and post_record.status in ('queued', 'deleted_by_mod')
    and cardinality(post_record.flagged_keywords) > 0
    and post_record.keyword_reviewed_at is null
    and public.is_epsu_moderator(p_epsu_id);
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
    and status in ('queued', 'deleted_by_mod');

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
