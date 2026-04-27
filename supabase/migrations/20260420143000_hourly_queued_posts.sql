alter table public.posts
  drop constraint if exists posts_status_check;

alter table public.posts
  add column if not exists release_at timestamptz,
  add column if not exists expire_at timestamptz,
  add column if not exists flagged_keywords text[] not null default '{}'::text[],
  add column if not exists keyword_reviewed_at timestamptz,
  add column if not exists keyword_reviewed_by_profile_id uuid references public.profiles (id) on delete set null;

update public.posts
set release_at = coalesce(release_at, created_at),
    expire_at = coalesce(expire_at, created_at + interval '24 hours'),
    flagged_keywords = coalesce(flagged_keywords, '{}'::text[])
where release_at is null
   or expire_at is null
   or flagged_keywords is null;

alter table public.posts
  alter column release_at set not null,
  alter column expire_at set not null,
  alter column flagged_keywords set not null;

alter table public.posts
  add constraint posts_status_check
  check (status in ('queued', 'active', 'expired', 'deleted_by_threshold', 'deleted_by_mod'));

create unique index if not exists posts_epsu_id_author_id_release_at_key
on public.posts (epsu_id, author_id, release_at);

create index if not exists posts_status_release_at_idx
on public.posts (status, release_at asc);

create index if not exists posts_status_expire_at_idx
on public.posts (status, expire_at asc);

create index if not exists posts_epsu_id_status_release_at_number_idx
on public.posts (epsu_id, status, release_at asc, number asc);

create index if not exists posts_epsu_id_status_keyword_reviewed_at_idx
on public.posts (epsu_id, status, keyword_reviewed_at);

create or replace function public.next_post_release_at(p_now timestamptz default timezone('utc', now()))
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (date_trunc('hour', p_now at time zone 'utc') + interval '1 hour') at time zone 'utc';
$$;

drop policy if exists "posts_select_visible" on public.posts;
create policy "posts_select_visible"
on public.posts
for select
to authenticated
using (
  status = 'active'
  and public.can_view_epsu_feed(epsu_id)
);

drop policy if exists "posts_insert_author" on public.posts;
create policy "posts_insert_author"
on public.posts
for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.can_view_epsu_feed(epsu_id)
);

drop policy if exists "post_reactions_insert_own" on public.post_reactions;
create policy "post_reactions_insert_own"
on public.post_reactions
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and exists (
    select 1
    from public.posts post_record
    where post_record.id = post_id
      and post_record.status = 'active'
      and public.can_view_epsu_feed(post_record.epsu_id)
  )
);

drop policy if exists "post_reports_insert_own" on public.post_reports;
create policy "post_reports_insert_own"
on public.post_reports
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and exists (
    select 1
    from public.posts post_record
    where post_record.id = post_id
      and post_record.status = 'active'
      and public.can_view_epsu_feed(post_record.epsu_id)
  )
);

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

  if not found or not public.is_epsu_moderator(target_post.epsu_id) then
    raise exception 'Moderator access required';
  end if;

  normalized_reason := nullif(trim(coalesce(p_reason, '')), '');

  update public.posts
  set status = 'deleted_by_mod'
  where id = p_post_id;

  update public.post_reports
  set status = 'resolved'
  where post_id = p_post_id
    and status = 'open';

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type, details)
  values (
    auth.uid(),
    target_post.author_id,
    target_post.epsu_id,
    p_post_id,
    'remove_post',
    jsonb_strip_nulls(jsonb_build_object('reason', normalized_reason))
  );

  return jsonb_build_object('ok', true);
end;
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
    and post_record.status = 'queued'
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
  normalized_reason text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_post
  from public.posts
  where id = p_post_id
    and status = 'queued';

  if not found or not public.is_epsu_moderator(target_post.epsu_id) then
    raise exception 'Moderator access required';
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

create or replace function public.release_queued_posts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
begin
  update public.posts
  set status = 'active'
  where status = 'queued'
    and keyword_reviewed_at is not null
    and release_at <= timezone('utc', now());

  get diagnostics released_count = row_count;

  return jsonb_build_object('ok', true, 'releasedCount', released_count);
end;
$$;

create or replace function public.delete_expired_posts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.posts
  where status = 'active'
    and expire_at <= timezone('utc', now());

  get diagnostics deleted_count = row_count;

  return jsonb_build_object('ok', true, 'deletedCount', deleted_count);
end;
$$;

grant execute on function public.next_post_release_at(timestamptz) to authenticated;
grant execute on function public.create_epsu_post(uuid, text, text, uuid, text[]) to authenticated;
grant execute on function public.react_to_post(uuid, text) to authenticated;
grant execute on function public.fetch_flagged_queued_posts(uuid) to authenticated;
grant execute on function public.mark_queued_post_reviewed(uuid, text) to authenticated;
grant execute on function public.release_queued_posts() to authenticated;
grant execute on function public.delete_expired_posts() to authenticated;
