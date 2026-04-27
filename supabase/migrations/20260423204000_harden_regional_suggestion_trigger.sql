create or replace function public.enforce_regional_suggestion_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_slug text;
  generated_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if new.profile_id is distinct from auth.uid() then
    raise exception 'You can only create suggestions for yourself';
  end if;

  new.title := initcap(lower(regexp_replace(trim(coalesce(new.title, '')), '\s+', ' ', 'g')));
  new.country_code := upper(trim(coalesce(new.country_code, '')));

  if char_length(new.title) < 2 then
    raise exception 'Location required';
  end if;

  if char_length(new.country_code) <> 2 then
    raise exception 'Choose a country first';
  end if;

  if public.count_regional_epsu_memberships(auth.uid()) >= 1 then
    raise exception 'You can only be in one regional Epsu at a time';
  end if;

  generated_slug := format(
    '%s-%s-epsu',
    regexp_replace(
      lower(regexp_replace(new.title, '[^A-Za-z0-9]+', '-', 'g')),
      '^-+|-+$',
      '',
      'g'
    ),
    lower(new.country_code)
  );
  generated_name := new.title || ' Epsu';

  if exists (
    select 1
    from public.epsus epsu
    where epsu.review_status in ('pending', 'approved')
      and (
        epsu.slug = generated_slug
        or (
          epsu.country_code = new.country_code
          and lower(trim(epsu.name)) = lower(generated_name)
        )
      )
  ) then
    raise exception 'This Epsu already exists';
  end if;

  if exists (
    select 1
    from public.epsu_suggestions suggestion
    where suggestion.profile_id = auth.uid()
      and suggestion.title = new.title
      and suggestion.country_code = new.country_code
      and suggestion.status = 'new'
  ) then
    raise exception 'You already suggested this location';
  end if;

  return new;
end;
$$;
