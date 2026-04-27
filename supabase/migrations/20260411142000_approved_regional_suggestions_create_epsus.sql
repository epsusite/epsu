create or replace function public.review_regional_epsu_suggestion(p_title text, p_country_code text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_title text;
  normalized_country_code text;
  generated_slug text;
  generated_code text;
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

  normalized_title := trim(coalesce(p_title, ''));
  normalized_country_code := upper(trim(coalesce(p_country_code, '')));

  if normalized_title = '' then
    raise exception 'Suggestion title required';
  end if;

  if char_length(normalized_country_code) <> 2 then
    raise exception 'Country code required';
  end if;

  if p_status = 'approved' then
    generated_slug := format(
      '%s-%s-epsu',
      regexp_replace(
        lower(regexp_replace(normalized_title, '[^A-Za-z0-9]+', '-', 'g')),
        '^-+|-+$',
        '',
        'g'
      ),
      lower(normalized_country_code)
    );
    generated_code := left(upper(regexp_replace(normalized_title, '[^A-Za-z0-9]', '', 'g')), 3);

    if generated_code = '' then
      generated_code := 'REG';
    end if;

    insert into public.epsus (slug, name, code, scope, country_code, review_status)
    values (generated_slug, normalized_title || ' Epsu', generated_code, 'city', normalized_country_code, 'approved')
    on conflict (slug) do nothing;
  end if;

  update public.epsu_suggestions
  set status = p_status
  where title = normalized_title
    and country_code = normalized_country_code
    and status = 'new';

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.review_regional_epsu_suggestion(text, text, text) to authenticated;
