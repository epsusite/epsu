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

  insert into public.epsus (slug, name, code, scope, website, review_status, country_code)
  values (p_slug, p_school_name, p_code, 'school', p_website, 'pending', upper(trim(p_country_code)))
  returning * into created_epsu;

  return jsonb_build_object(
    'id', created_epsu.id,
    'slug', created_epsu.slug,
    'name', created_epsu.name,
    'code', created_epsu.code,
    'scope', created_epsu.scope,
    'website', created_epsu.website,
    'review_status', created_epsu.review_status,
    'country_code', created_epsu.country_code
  );
end;
$$;

grant execute on function public.create_school_epsu(text, text, text, text, text) to authenticated;
