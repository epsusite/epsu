drop index if exists public.epsu_suggestions_profile_id_title_country_code_key;

create unique index if not exists epsu_suggestions_profile_id_title_country_code_new_key
on public.epsu_suggestions (profile_id, title, country_code)
where status = 'new';

create or replace function public.submit_regional_epsu_suggestion(p_title text, p_country_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_title text;
  normalized_country_code text;
  generated_slug text;
  generated_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_title := initcap(lower(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g')));
  normalized_country_code := upper(trim(coalesce(p_country_code, '')));

  if char_length(normalized_title) < 2 then
    raise exception 'Location required';
  end if;

  if char_length(normalized_country_code) <> 2 then
    raise exception 'Choose a country first';
  end if;

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
  generated_name := normalized_title || ' Epsu';

  if exists (
    select 1
    from public.epsus epsu
    where epsu.review_status in ('pending', 'approved')
      and (
        epsu.slug = generated_slug
        or (
          epsu.country_code = normalized_country_code
          and lower(trim(epsu.name)) = lower(generated_name)
        )
      )
  ) then
    return jsonb_build_object('ok', false, 'message', 'This Epsu already exists');
  end if;

  if exists (
    select 1
    from public.epsu_suggestions suggestion
    where suggestion.profile_id = auth.uid()
      and suggestion.title = normalized_title
      and suggestion.country_code = normalized_country_code
      and suggestion.status = 'new'
  ) then
    return jsonb_build_object('ok', false, 'message', 'You already suggested this location');
  end if;

  begin
    insert into public.epsu_suggestions (
      profile_id,
      title,
      country_code
    )
    values (
      auth.uid(),
      normalized_title,
      normalized_country_code
    );
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'message', 'You already suggested this location');
  end;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.submit_regional_epsu_suggestion(text, text) to authenticated;
