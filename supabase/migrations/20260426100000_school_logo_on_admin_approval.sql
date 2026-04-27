drop function if exists public.create_school_epsu(text, text, text, text, text, text);
drop function if exists public.review_pending_school_epsu(uuid, text);

create or replace function public.create_school_epsu(
  p_school_name text,
  p_code text,
  p_slug text,
  p_website text,
  p_country_code text
)
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

  insert into public.epsus (slug, name, code, scope, website, review_status, country_code, host_id)
  values (
    p_slug,
    p_school_name,
    p_code,
    'school',
    p_website,
    'pending',
    upper(trim(p_country_code)),
    auth.uid()
  )
  returning * into created_epsu;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
  values (created_epsu.id, auth.uid(), 'host', 'active', null)
  on conflict (epsu_id, profile_id)
  do update set
    role = 'host',
    status = 'active',
    muted_until = null;

  return jsonb_build_object(
    'id', created_epsu.id,
    'slug', created_epsu.slug,
    'name', created_epsu.name,
    'code', created_epsu.code,
    'scope', created_epsu.scope,
    'website', created_epsu.website,
    'logo_path', created_epsu.logo_path,
    'review_status', created_epsu.review_status,
    'country_code', created_epsu.country_code,
    'host_id', created_epsu.host_id
  );
end;
$$;

create or replace function public.review_pending_school_epsu(
  p_epsu_id uuid,
  p_status text,
  p_logo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
  normalized_logo_path text;
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

    update public.epsus
    set review_status = 'approved',
        logo_path = normalized_logo_path
    where id = target_epsu.id
    returning * into target_epsu;

    if target_epsu.host_id is not null then
      if not public.is_platform_admin(target_epsu.host_id)
        and public.count_school_epsu_memberships(target_epsu.host_id, target_epsu.id) >= 3 then
        raise exception 'User already has three school Epsus';
      end if;

      insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
      values (target_epsu.id, target_epsu.host_id, 'host', 'active', null)
      on conflict (epsu_id, profile_id)
      do update set
        role = 'host',
        status = 'active',
        muted_until = null;
    end if;

    return jsonb_build_object(
      'ok', true,
      'id', target_epsu.id,
      'review_status', target_epsu.review_status
    );
  end if;

  delete from public.epsus
  where id = target_epsu.id;

  return jsonb_build_object(
    'ok', true,
    'id', target_epsu.id,
    'review_status', 'rejected'
  );
end;
$$;

grant execute on function public.create_school_epsu(text, text, text, text, text) to authenticated;
grant execute on function public.review_pending_school_epsu(uuid, text, text) to authenticated;
