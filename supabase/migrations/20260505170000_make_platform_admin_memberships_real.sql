create or replace function public.ensure_platform_admin_epsu_membership(
  p_epsu_id uuid,
  p_profile_id uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_epsu_id is null or p_profile_id is null then
    return;
  end if;

  if not public.is_platform_admin(p_profile_id) then
    return;
  end if;

  if not exists (
    select 1
    from public.epsus epsu
    where epsu.id = p_epsu_id
  ) then
    return;
  end if;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
  values (p_epsu_id, p_profile_id, 'member', 'active', null)
  on conflict (epsu_id, profile_id)
  do update set
    role = case
      when public.epsu_memberships.role in ('host', 'moderator') then public.epsu_memberships.role
      else 'member'
    end,
    status = case
      when public.epsu_memberships.status = 'muted'
        and (
          public.epsu_memberships.muted_until is null
          or public.epsu_memberships.muted_until > timezone('utc', now())
        ) then 'muted'
      else 'active'
    end,
    muted_until = case
      when public.epsu_memberships.status = 'muted'
        and (
          public.epsu_memberships.muted_until is null
          or public.epsu_memberships.muted_until > timezone('utc', now())
        ) then public.epsu_memberships.muted_until
      else null
    end;
end;
$$;

create or replace function public.ensure_platform_admin_memberships(
  p_profile_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ensured_count integer := 0;
begin
  if p_profile_id is null then
    raise exception 'Authentication required';
  end if;

  if auth.uid() is distinct from p_profile_id and not public.is_platform_admin() then
    raise exception 'Administrator access required';
  end if;

  if not public.is_platform_admin(p_profile_id) then
    return jsonb_build_object('ok', true, 'ensuredCount', 0);
  end if;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
  select epsu.id, p_profile_id, 'member', 'active', null
  from public.epsus epsu
  on conflict (epsu_id, profile_id)
  do update set
    role = case
      when public.epsu_memberships.role in ('host', 'moderator') then public.epsu_memberships.role
      else 'member'
    end,
    status = case
      when public.epsu_memberships.status = 'muted'
        and (
          public.epsu_memberships.muted_until is null
          or public.epsu_memberships.muted_until > timezone('utc', now())
        ) then 'muted'
      else 'active'
    end,
    muted_until = case
      when public.epsu_memberships.status = 'muted'
        and (
          public.epsu_memberships.muted_until is null
          or public.epsu_memberships.muted_until > timezone('utc', now())
        ) then public.epsu_memberships.muted_until
      else null
    end;

  get diagnostics ensured_count = row_count;

  return jsonb_build_object('ok', true, 'ensuredCount', ensured_count);
end;
$$;

create or replace function public.kick_school_epsu_member(p_epsu_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_epsu_capability(p_epsu_id, 'host') then
    raise exception 'Host access required';
  end if;

  if public.is_platform_admin(p_profile_id) then
    raise exception 'Platform admins cannot be kicked';
  end if;

  if public.is_epsu_host(p_epsu_id, p_profile_id) then
    raise exception 'Hosts cannot be kicked';
  end if;

  update public.epsu_memberships
  set status = 'kicked',
      muted_until = null
  where epsu_id = p_epsu_id
    and profile_id = p_profile_id;

  delete from public.moderation_actions
  where epsu_id = p_epsu_id
    and target_profile_id = p_profile_id
    and action_type in ('remove_post', 'mute_author_24h');

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, action_type, details)
  values (
    auth.uid(),
    p_profile_id,
    p_epsu_id,
    'kick_school_member',
    jsonb_build_object('status', 'kicked')
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.leave_epsu(p_epsu_id uuid)
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

  if public.is_platform_admin() then
    raise exception 'Platform admins cannot leave Epsus';
  end if;

  select *
  into target_epsu
  from public.epsus
  where id = p_epsu_id;

  if not found then
    raise exception 'Epsu not found';
  end if;

  select *
  into membership_record
  from public.epsu_memberships
  where epsu_id = p_epsu_id
    and profile_id = auth.uid();

  if not found or membership_record.status not in ('active', 'muted') then
    raise exception 'Membership not found';
  end if;

  if public.is_epsu_host(p_epsu_id, auth.uid()) then
    raise exception 'Hosts cannot leave here';
  end if;

  update public.epsu_memberships
  set status = 'left',
      muted_until = null
  where id = membership_record.id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mute_epsu_member(p_profile_id uuid, p_epsu_id uuid, p_post_id uuid, p_reason text default null)
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

  if not public.has_epsu_capability(p_epsu_id, 'moderate') then
    raise exception 'Moderator access required';
  end if;

  if p_profile_id is null then
    raise exception 'Post author could not be identified';
  end if;

  perform public.ensure_platform_admin_epsu_membership(p_epsu_id, p_profile_id);

  if not exists (
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = p_epsu_id
      and membership.profile_id = p_profile_id
      and membership.status in ('active', 'muted')
  ) then
    raise exception 'Author is not an active member of this Epsu';
  end if;

  mute_until := timezone('utc', now()) + interval '24 hours';

  update public.epsu_memberships
  set status = 'muted',
      muted_until = mute_until
  where epsu_id = p_epsu_id
    and profile_id = p_profile_id
    and status in ('active', 'muted');

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type, details)
  values (
    auth.uid(),
    p_profile_id,
    p_epsu_id,
    p_post_id,
    'mute_author_24h',
    '{}'::jsonb
  );

  return jsonb_build_object('ok', true, 'muteUntil', mute_until);
end;
$$;

grant execute on function public.ensure_platform_admin_epsu_membership(uuid, uuid) to authenticated;
grant execute on function public.ensure_platform_admin_memberships(uuid) to authenticated;
