create or replace function public.can_view_epsu_feed(
  target_epsu_id uuid,
  target_profile_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = target_epsu_id
      and membership.profile_id = target_profile_id
      and membership.status in ('active', 'muted')
  ) or exists (
    select 1
    from public.epsus epsu
    where epsu.id = target_epsu_id
      and epsu.owner_id = target_profile_id
  );
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

drop policy if exists epsu_presence_select_visible on public.epsu_presence;
create policy epsu_presence_select_visible
on public.epsu_presence
for select
to authenticated
using (public.can_view_epsu_feed(epsu_id));

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
  should_delete := total_reactions >= 100 and next_dislike_count::numeric / total_reactions >= 0.6;

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

create or replace function public.join_public_epsu(p_epsu_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
  membership_record public.epsu_memberships%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_epsu
  from public.epsus
  where id = p_epsu_id;

  if not found then
    raise exception 'Epsu not found';
  end if;

  if target_epsu.scope = 'private' then
    raise exception 'Private Epsus require an invite';
  end if;

  if target_epsu.scope = 'school' then
    raise exception 'School Epsus require an application';
  end if;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status)
  values (p_epsu_id, auth.uid(), 'member', 'active')
  on conflict (epsu_id, profile_id)
  do update set
    status = case
      when public.epsu_memberships.status = 'left' then 'active'
      else public.epsu_memberships.status
    end
  returning * into membership_record;

  return jsonb_build_object(
    'id', membership_record.id,
    'epsuId', membership_record.epsu_id,
    'profileId', membership_record.profile_id,
    'role', membership_record.role,
    'status', membership_record.status
  );
end;
$$;

create or replace function public.join_all_public_epsus()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status)
  select epsu.id, auth.uid(), 'member', 'active'
  from public.epsus epsu
  where epsu.scope in ('country', 'state', 'city')
  on conflict (epsu_id, profile_id)
  do update set
    status = case
      when public.epsu_memberships.status = 'left' then 'active'
      else public.epsu_memberships.status
    end;
end;
$$;

create or replace function public.fetch_epsu_population_counts(p_epsu_ids uuid[])
returns table (
  epsu_id uuid,
  member_count bigint,
  online_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with requested_epsus as (
    select distinct requested_id as epsu_id
    from unnest(coalesce(p_epsu_ids, '{}')) as requested_id
    where exists (
      select 1
      from public.epsus epsu
      where epsu.id = requested_id
        and (
          epsu.scope = 'school'
          or public.can_view_epsu_feed(requested_id)
        )
    )
  ),
  member_profiles as (
    select membership.epsu_id, membership.profile_id
    from public.epsu_memberships membership
    where membership.status = 'active'
      and membership.epsu_id in (select epsu_id from requested_epsus)
    union
    select epsu.id as epsu_id, epsu.owner_id as profile_id
    from public.epsus epsu
    where epsu.owner_id is not null
      and epsu.id in (select epsu_id from requested_epsus)
  ),
  member_counts as (
    select
      member_profiles.epsu_id,
      count(*)::bigint as member_count
    from member_profiles
    group by member_profiles.epsu_id
  ),
  online_counts as (
    select
      presence.epsu_id,
      count(*)::bigint as online_count
    from public.epsu_presence presence
    where presence.last_seen_at >= timezone('utc', now()) - interval '90 seconds'
      and presence.epsu_id in (select epsu_id from requested_epsus)
    group by presence.epsu_id
  )
  select
    requested_epsus.epsu_id,
    coalesce(member_counts.member_count, 0) as member_count,
    coalesce(online_counts.online_count, 0) as online_count
  from requested_epsus
  left join member_counts on member_counts.epsu_id = requested_epsus.epsu_id
  left join online_counts on online_counts.epsu_id = requested_epsus.epsu_id;
$$;

grant execute on function public.can_view_epsu_feed(uuid, uuid) to authenticated;
grant execute on function public.create_epsu_post(uuid, text, text, uuid) to authenticated;
grant execute on function public.react_to_post(uuid, text) to authenticated;
grant execute on function public.join_public_epsu(uuid) to authenticated;
grant execute on function public.join_all_public_epsus() to authenticated;
grant execute on function public.fetch_epsu_population_counts(uuid[]) to authenticated;
