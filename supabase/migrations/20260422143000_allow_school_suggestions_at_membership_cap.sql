create or replace function public.create_school_epsu(
  p_school_name text,
  p_code text,
  p_slug text,
  p_website text,
  p_country_code text,
  p_logo_path text
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

  if coalesce(trim(p_logo_path), '') = '' then
    raise exception 'School logo required';
  end if;

  insert into public.epsus (slug, name, code, scope, website, logo_path, review_status, country_code, host_id)
  values (
    p_slug,
    p_school_name,
    p_code,
    'school',
    p_website,
    trim(p_logo_path),
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
