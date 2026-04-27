create or replace function public.is_platform_admin(target_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = target_profile_id
      and lower(profile.username) = 'admincat'
  );
$$;

create or replace function public.fetch_pending_school_epsus()
returns table (
  id uuid,
  slug text,
  name text,
  code text,
  website text,
  country_code text,
  review_status text,
  created_at timestamptz,
  owner_id uuid,
  owner_username text
)
language sql
security definer
set search_path = public
as $$
  select
    epsu.id,
    epsu.slug,
    epsu.name,
    epsu.code,
    epsu.website,
    epsu.country_code,
    epsu.review_status,
    epsu.created_at,
    epsu.owner_id,
    profile.username as owner_username
  from public.epsus epsu
  left join public.profiles profile on profile.id = epsu.owner_id
  where public.is_platform_admin()
    and epsu.scope = 'school'
    and epsu.review_status = 'pending'
  order by epsu.created_at asc;
$$;

create or replace function public.review_pending_school_epsu(p_epsu_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_epsu public.epsus%rowtype;
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

  update public.epsus
  set review_status = p_status
  where id = p_epsu_id
    and scope = 'school'
    and review_status = 'pending'
  returning * into updated_epsu;

  if not found then
    raise exception 'Pending school Epsu not found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', updated_epsu.id,
    'review_status', updated_epsu.review_status
  );
end;
$$;

grant execute on function public.is_platform_admin(uuid) to authenticated;
grant execute on function public.fetch_pending_school_epsus() to authenticated;
grant execute on function public.review_pending_school_epsu(uuid, text) to authenticated;
