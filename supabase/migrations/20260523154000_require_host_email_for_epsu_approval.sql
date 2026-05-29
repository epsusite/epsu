create or replace function public.review_pending_regional_epsu(
  p_epsu_id uuid,
  p_status text,
  p_logo_path text default null,
  p_host_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
  normalized_logo_path text;
  normalized_host_email text;
  reviewed_at_now timestamptz;
  target_host_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  normalized_logo_path := nullif(trim(coalesce(p_logo_path, '')), '');
  normalized_host_email := nullif(lower(trim(coalesce(p_host_email, ''))), '');
  reviewed_at_now := timezone('utc', now());

  select *
  into target_epsu
  from public.epsus
  where id = p_epsu_id
    and scope in ('city', 'state', 'country')
    and review_status = 'pending';

  if not found then
    raise exception 'Pending regional Epsu not found';
  end if;

  if p_status = 'approved' then
    if normalized_logo_path is null then
      raise exception 'Regional logo required';
    end if;

    if normalized_host_email is null then
      raise exception 'Host email required';
    end if;

    select profile.id
    into target_host_id
    from public.profiles profile
    where lower(profile.email) = normalized_host_email
    limit 1;

    if target_host_id is null then
      raise exception 'Host email must belong to an existing account';
    end if;

    if not public.is_platform_admin(target_host_id)
      and public.count_regional_epsu_memberships(target_host_id, target_epsu.id) >= 1 then
      raise exception 'User already has one regional Epsu';
    end if;

    update public.epsus
    set review_status = 'approved',
        host_id = target_host_id,
        logo_path = normalized_logo_path,
        is_trial = true,
        trial_member_goal = 14,
        trial_started_at = reviewed_at_now,
        trial_ends_at = reviewed_at_now + interval '7 days',
        trial_converted_at = null,
        trial_created_by_profile_id = target_host_id
    where id = target_epsu.id
    returning * into target_epsu;

    insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
    values (target_epsu.id, target_host_id, 'host', 'active', null)
    on conflict (epsu_id, profile_id)
    do update set
      role = 'host',
      status = 'active',
      muted_until = null;

    update public.epsu_trial_submissions
    set status = 'approved',
        reviewed_at = reviewed_at_now,
        approved_at = reviewed_at_now,
        cooldown_until = reviewed_at_now + interval '7 days'
    where epsu_id = target_epsu.id
      and status = 'pending';

    perform public.convert_trial_epsu_if_ready(target_epsu.id);

    return jsonb_build_object(
      'ok', true,
      'id', target_epsu.id,
      'review_status', target_epsu.review_status
    );
  end if;

  update public.epsu_trial_submissions
  set status = 'rejected',
      reviewed_at = reviewed_at_now,
      cooldown_until = reviewed_at_now + interval '7 days'
  where epsu_id = target_epsu.id
    and status = 'pending';

  delete from public.epsus
  where id = target_epsu.id;

  return jsonb_build_object(
    'ok', true,
    'id', target_epsu.id,
    'review_status', 'rejected'
  );
end;
$$;

grant execute on function public.review_pending_regional_epsu(uuid, text, text, text) to authenticated;

create or replace function public.review_pending_school_epsu(
  p_epsu_id uuid,
  p_status text,
  p_logo_path text default null,
  p_host_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
  normalized_logo_path text;
  normalized_host_email text;
  reviewed_at_now timestamptz;
  target_host_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Administrator access required';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  normalized_logo_path := nullif(trim(coalesce(p_logo_path, '')), '');
  normalized_host_email := nullif(lower(trim(coalesce(p_host_email, ''))), '');
  reviewed_at_now := timezone('utc', now());

  select *
  into target_epsu
  from public.epsus
  where id = p_epsu_id
    and scope = 'school'
    and review_status = 'pending';

  if not found then
    raise exception 'Pending school Epsu not found';
  end if;

  if p_status = 'approved' then
    if normalized_logo_path is null then
      raise exception 'School logo required';
    end if;

    if normalized_host_email is null then
      raise exception 'Host email required';
    end if;

    select profile.id
    into target_host_id
    from public.profiles profile
    where lower(profile.email) = normalized_host_email
    limit 1;

    if target_host_id is null then
      raise exception 'Host email must belong to an existing account';
    end if;

    if not public.is_platform_admin(target_host_id)
      and public.count_school_epsu_memberships(target_host_id, target_epsu.id) >= 3 then
      raise exception 'User already has three school Epsus';
    end if;

    update public.epsus
    set review_status = 'approved',
        host_id = target_host_id,
        logo_path = normalized_logo_path,
        is_trial = true,
        trial_member_goal = 14,
        trial_started_at = reviewed_at_now,
        trial_ends_at = reviewed_at_now + interval '7 days',
        trial_converted_at = null,
        trial_created_by_profile_id = target_host_id
    where id = target_epsu.id
    returning * into target_epsu;

    insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
    values (target_epsu.id, target_host_id, 'host', 'active', null)
    on conflict (epsu_id, profile_id)
    do update set
      role = 'host',
      status = 'active',
      muted_until = null;

    update public.epsu_trial_submissions
    set status = 'approved',
        reviewed_at = reviewed_at_now,
        approved_at = reviewed_at_now,
        cooldown_until = reviewed_at_now + interval '7 days'
    where epsu_id = target_epsu.id
      and status = 'pending';

    perform public.convert_trial_epsu_if_ready(target_epsu.id);

    return jsonb_build_object(
      'ok', true,
      'id', target_epsu.id,
      'review_status', target_epsu.review_status
    );
  end if;

  update public.epsu_trial_submissions
  set status = 'rejected',
      reviewed_at = reviewed_at_now,
      cooldown_until = reviewed_at_now + interval '7 days'
  where epsu_id = target_epsu.id
    and status = 'pending';

  update public.epsus
  set review_status = 'rejected'
  where id = target_epsu.id;

  return jsonb_build_object('ok', true, 'review_status', 'rejected');
end;
$$;

grant execute on function public.review_pending_school_epsu(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
