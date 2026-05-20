create or replace function public.fetch_all_queued_posts()
returns table (
  id uuid,
  epsu_id uuid,
  epsu_name text,
  number integer,
  title text,
  body text,
  author_id uuid,
  reply_to_post_id uuid,
  release_at timestamptz,
  created_at timestamptz,
  keyword_reviewed_at timestamptz,
  flagged_keywords text[]
)
language sql
security definer
set search_path = public
as $$
  select
    post_record.id,
    post_record.epsu_id,
    epsu.name as epsu_name,
    post_record.number,
    post_record.title,
    post_record.body,
    post_record.author_id,
    post_record.reply_to_post_id,
    post_record.release_at,
    post_record.created_at,
    post_record.keyword_reviewed_at,
    coalesce(post_record.flagged_keywords, '{}'::text[]) as flagged_keywords
  from public.posts post_record
  join public.epsus epsu on epsu.id = post_record.epsu_id
  where public.is_platform_admin()
    and post_record.status in ('queued', 'deleted_by_mod')
    and (
      cardinality(coalesce(post_record.flagged_keywords, '{}'::text[])) = 0
      or post_record.keyword_reviewed_at is not null
    )
  order by post_record.release_at asc nulls last, post_record.created_at asc, epsu.name asc, post_record.number asc;
$$;

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
    and public.has_epsu_capability(p_epsu_id, 'moderate');
$$;

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

create or replace function public.remove_epsu_post(p_post_id uuid, p_reason text default null)
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
    jsonb_strip_nulls(jsonb_build_object('reason', normalized_reason))
  );

  if target_post.author_id is not null then
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
