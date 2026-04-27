create or replace function public.is_epsu_member(target_epsu_id uuid, target_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = target_epsu_id
      and membership.profile_id = target_profile_id
      and membership.status = 'active'
  );
$$;

create or replace function public.is_epsu_owner(target_epsu_id uuid, target_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = target_epsu_id
      and membership.profile_id = target_profile_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) or exists(
    select 1
    from public.epsus epsu
    where epsu.id = target_epsu_id
      and epsu.owner_id = target_profile_id
  );
$$;

create or replace function public.is_epsu_moderator(target_epsu_id uuid, target_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = target_epsu_id
      and membership.profile_id = target_profile_id
      and membership.role in ('owner', 'moderator')
      and membership.status = 'active'
  ) or exists(
    select 1
    from public.epsus epsu
    where epsu.id = target_epsu_id
      and epsu.owner_id = target_profile_id
  );
$$;

create or replace function public.can_access_epsu(target_epsu_id uuid, target_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.epsus epsu
    where epsu.id = target_epsu_id
      and (
        epsu.scope <> 'private'
        or public.is_epsu_member(target_epsu_id, target_profile_id)
        or public.is_epsu_moderator(target_epsu_id, target_profile_id)
      )
  );
$$;

alter table public.profiles enable row level security;
alter table public.epsus enable row level security;
alter table public.epsu_memberships enable row level security;
alter table public.posts enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_reports enable row level security;
alter table public.epsu_suggestions enable row level security;
alter table public.epsu_invites enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.epsu_subscriptions enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "epsus_select_visible" on public.epsus;
create policy "epsus_select_visible"
on public.epsus
for select
to authenticated
using (
  (
    review_status = 'approved'
    and public.can_access_epsu(id)
  )
  or owner_id = auth.uid()
  or public.is_epsu_owner(id)
  or public.is_epsu_moderator(id)
);

drop policy if exists "epsu_memberships_select_scoped" on public.epsu_memberships;
create policy "epsu_memberships_select_scoped"
on public.epsu_memberships
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_epsu_owner(epsu_id)
  or public.is_epsu_moderator(epsu_id)
);

drop policy if exists "posts_select_visible" on public.posts;
create policy "posts_select_visible"
on public.posts
for select
to authenticated
using (
  status = 'active'
  and public.can_access_epsu(epsu_id)
);

drop policy if exists "posts_insert_author" on public.posts;
create policy "posts_insert_author"
on public.posts
for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.can_access_epsu(epsu_id)
);

drop policy if exists "post_reactions_select_own" on public.post_reactions;
create policy "post_reactions_select_own"
on public.post_reactions
for select
to authenticated
using (profile_id = auth.uid());

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
      and public.can_access_epsu(post_record.epsu_id)
  )
);

drop policy if exists "post_reports_select_scoped" on public.post_reports;
create policy "post_reports_select_scoped"
on public.post_reports
for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.posts post_record
    where post_record.id = post_id
      and public.is_epsu_moderator(post_record.epsu_id)
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
      and public.can_access_epsu(post_record.epsu_id)
  )
);

drop policy if exists "epsu_suggestions_select_own" on public.epsu_suggestions;
create policy "epsu_suggestions_select_own"
on public.epsu_suggestions
for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists "epsu_suggestions_insert_own" on public.epsu_suggestions;
create policy "epsu_suggestions_insert_own"
on public.epsu_suggestions
for insert
to authenticated
with check (profile_id = auth.uid());

drop policy if exists "epsu_invites_select_owner_scope" on public.epsu_invites;
create policy "epsu_invites_select_owner_scope"
on public.epsu_invites
for select
to authenticated
using (
  created_by_profile_id = auth.uid()
  or public.is_epsu_owner(epsu_id)
);

drop policy if exists "moderation_actions_select_scope" on public.moderation_actions;
create policy "moderation_actions_select_scope"
on public.moderation_actions
for select
to authenticated
using (public.is_epsu_moderator(epsu_id));

drop policy if exists "epsu_subscriptions_select_own" on public.epsu_subscriptions;
create policy "epsu_subscriptions_select_own"
on public.epsu_subscriptions
for select
to authenticated
using (profile_id = auth.uid());

create or replace function public.create_school_epsu(p_school_name text, p_code text, p_slug text, p_website text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_epsu public.epsus%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.epsus (slug, name, code, scope, website, review_status, owner_id)
  values (p_slug, p_school_name, p_code, 'school', p_website, 'pending', auth.uid())
  returning * into created_epsu;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status)
  values (created_epsu.id, auth.uid(), 'owner', 'active')
  on conflict (epsu_id, profile_id)
  do update set role = excluded.role, status = excluded.status;

  return jsonb_build_object(
    'id', created_epsu.id,
    'slug', created_epsu.slug,
    'name', created_epsu.name,
    'code', created_epsu.code,
    'scope', created_epsu.scope,
    'website', created_epsu.website,
    'review_status', created_epsu.review_status
  );
end;
$$;

create or replace function public.ensure_epsu_invite(p_epsu_id uuid, p_invite_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record public.epsu_invites%rowtype;
  invite_token text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_epsu_owner(p_epsu_id) then
    raise exception 'Only owners can generate invites';
  end if;

  if p_invite_role not in ('member', 'moderator') then
    raise exception 'Invalid invite role';
  end if;

  update public.epsu_invites
  set is_active = false
  where epsu_id = p_epsu_id
    and created_by_profile_id = auth.uid()
    and invite_role = p_invite_role
    and is_active = true;

  invite_token := encode(extensions.gen_random_bytes(24), 'base64');
  invite_token := replace(replace(replace(invite_token, '/', ''), '+', ''), '=', '');

  insert into public.epsu_invites (epsu_id, created_by_profile_id, invite_role, token, max_uses)
  values (p_epsu_id, auth.uid(), p_invite_role, invite_token, 1)
  returning * into invite_record;

  return jsonb_build_object(
    'id', invite_record.id,
    'token', invite_record.token,
    'invite_role', invite_record.invite_role,
    'epsu_id', invite_record.epsu_id,
    'is_active', invite_record.is_active,
    'use_count', invite_record.use_count,
    'max_uses', invite_record.max_uses
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

  if not found or not public.can_access_epsu(target_post.epsu_id) then
    raise exception 'Post not available';
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

create or replace function public.dismiss_epsu_report(p_post_id uuid)
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
  where id = p_post_id;

  if not found or not public.is_epsu_moderator(target_post.epsu_id) then
    raise exception 'Moderator access required';
  end if;

  update public.post_reports
  set status = 'rejected'
  where post_id = p_post_id
    and status = 'open';

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type)
  values (auth.uid(), target_post.author_id, target_post.epsu_id, p_post_id, 'dismiss_report');

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.remove_epsu_post(p_post_id uuid)
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
  where id = p_post_id;

  if not found or not public.is_epsu_moderator(target_post.epsu_id) then
    raise exception 'Moderator access required';
  end if;

  update public.posts
  set status = 'deleted_by_mod'
  where id = p_post_id;

  update public.post_reports
  set status = 'resolved'
  where post_id = p_post_id
    and status = 'open';

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type)
  values (auth.uid(), target_post.author_id, target_post.epsu_id, p_post_id, 'remove_post');

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mute_epsu_member(p_profile_id uuid, p_epsu_id uuid, p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mute_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_epsu_moderator(p_epsu_id) then
    raise exception 'Moderator access required';
  end if;

  if exists (
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = p_epsu_id
      and membership.profile_id = p_profile_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise exception 'Owners cannot be muted';
  end if;

  update public.epsu_memberships
  set status = 'muted'
  where epsu_id = p_epsu_id
    and profile_id = p_profile_id;

  update public.post_reports
  set status = 'resolved'
  where post_id = p_post_id
    and status = 'open';

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type)
  values (auth.uid(), p_profile_id, p_epsu_id, p_post_id, 'mute_author_24h');

  mute_until := timezone('utc', now()) + interval '24 hours';

  return jsonb_build_object('ok', true, 'muteUntil', mute_until);
end;
$$;

create or replace function public.set_epsu_membership_role(p_membership_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_record public.epsu_memberships%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_role not in ('member', 'moderator') then
    raise exception 'Invalid membership role';
  end if;

  select *
  into membership_record
  from public.epsu_memberships
  where id = p_membership_id;

  if not found then
    raise exception 'Membership not found';
  end if;

  if not public.is_epsu_owner(membership_record.epsu_id) then
    raise exception 'Owner access required';
  end if;

  if membership_record.role = 'owner' then
    raise exception 'Owner role cannot be changed here';
  end if;

  update public.epsu_memberships
  set role = p_role
  where id = p_membership_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.set_epsu_membership_status(p_membership_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_record public.epsu_memberships%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_status not in ('active', 'left') then
    raise exception 'Invalid membership status';
  end if;

  select *
  into membership_record
  from public.epsu_memberships
  where id = p_membership_id;

  if not found then
    raise exception 'Membership not found';
  end if;

  if auth.uid() = membership_record.profile_id then
    if p_status <> 'left' then
      raise exception 'Members can only leave their own Epsu';
    end if;
  elsif not public.is_epsu_owner(membership_record.epsu_id) then
    raise exception 'Owner access required';
  end if;

  if membership_record.role = 'owner' then
    raise exception 'Owner membership status cannot be changed here';
  end if;

  update public.epsu_memberships
  set status = p_status
  where id = p_membership_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.delete_owned_epsu(p_epsu_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_epsu_owner(p_epsu_id) then
    raise exception 'Owner access required';
  end if;

  delete from public.epsus
  where id = p_epsu_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.create_school_epsu(text, text, text, text) to authenticated;
grant execute on function public.ensure_epsu_invite(uuid, text) to authenticated;
grant execute on function public.react_to_post(uuid, text) to authenticated;
grant execute on function public.dismiss_epsu_report(uuid) to authenticated;
grant execute on function public.remove_epsu_post(uuid) to authenticated;
grant execute on function public.mute_epsu_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.set_epsu_membership_role(uuid, text) to authenticated;
grant execute on function public.set_epsu_membership_status(uuid, text) to authenticated;
grant execute on function public.delete_owned_epsu(uuid) to authenticated;
