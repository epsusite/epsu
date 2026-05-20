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

  if target_epsu.scope <> 'school'
    and public.count_regional_epsu_memberships(auth.uid(), p_epsu_id) >= 1 then
    raise exception 'You can only have one regional Epsu at a time';
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

  perform public.convert_trial_epsu_if_ready(p_epsu_id);

  return jsonb_build_object(
    'id', membership_record.id,
    'epsuId', membership_record.epsu_id,
    'profileId', membership_record.profile_id,
    'role', membership_record.role,
    'status', membership_record.status
  );
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

  select *
  into target_epsu
  from public.epsus
  where id = p_epsu_id;

  if not found then
    raise exception 'Epsu not found';
  end if;

  if not public.is_epsu_host(p_epsu_id) then
    raise exception 'Host access required';
  end if;

  if exists (
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = p_epsu_id
      and membership.profile_id = p_profile_id
      and membership.role = 'host'
      and membership.status = 'active'
  ) then
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

  if membership_record.role = 'host' then
    raise exception 'Hosts cannot leave here';
  end if;

  update public.epsu_memberships
  set status = 'left',
      muted_until = null
  where id = membership_record.id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.join_public_epsu(uuid) to authenticated;
grant execute on function public.kick_school_epsu_member(uuid, uuid) to authenticated;
grant execute on function public.leave_epsu(uuid) to authenticated;
