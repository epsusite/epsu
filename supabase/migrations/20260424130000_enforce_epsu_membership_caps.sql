create or replace function public.count_school_epsu_memberships(
  p_profile_id uuid default auth.uid(),
  p_excluded_epsu_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_platform_admin(p_profile_id) then 0
    else (
      select count(*)
      from public.epsu_memberships membership
      join public.epsus epsu on epsu.id = membership.epsu_id
      where membership.profile_id = p_profile_id
        and membership.status in ('active', 'muted', 'invited')
        and epsu.scope = 'school'
        and epsu.review_status = 'approved'
        and (p_excluded_epsu_id is null or membership.epsu_id <> p_excluded_epsu_id)
    )::integer
  end;
$$;

create or replace function public.count_regional_epsu_memberships(
  p_profile_id uuid default auth.uid(),
  p_excluded_epsu_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_platform_admin(p_profile_id) then 0
    else (
      select count(*)
      from public.epsu_memberships membership
      join public.epsus epsu on epsu.id = membership.epsu_id
      where membership.profile_id = p_profile_id
        and membership.status in ('active', 'muted', 'invited')
        and epsu.scope <> 'school'
        and epsu.scope <> 'private'
        and epsu.review_status = 'approved'
        and (p_excluded_epsu_id is null or membership.epsu_id <> p_excluded_epsu_id)
    )::integer
  end;
$$;

create or replace function public.enforce_epsu_membership_caps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
begin
  if new.profile_id is null then
    return new;
  end if;

  if public.is_platform_admin(new.profile_id) then
    return new;
  end if;

  if new.status not in ('active', 'muted', 'invited') then
    return new;
  end if;

  select *
  into target_epsu
  from public.epsus
  where id = new.epsu_id;

  if not found or target_epsu.review_status <> 'approved' then
    return new;
  end if;

  if target_epsu.scope = 'school' then
    if public.count_school_epsu_memberships(new.profile_id, new.epsu_id) >= 3 then
      raise exception 'You can only be in three school Epsus at once';
    end if;

    return new;
  end if;

  if target_epsu.scope <> 'private' then
    if public.count_regional_epsu_memberships(new.profile_id, new.epsu_id) >= 1 then
      raise exception 'You can only have one regional Epsu at a time';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists epsu_memberships_enforce_caps on public.epsu_memberships;
create trigger epsu_memberships_enforce_caps
before insert or update of epsu_id, profile_id, status on public.epsu_memberships
for each row
execute function public.enforce_epsu_membership_caps();
