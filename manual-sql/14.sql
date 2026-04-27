alter table public.epsu_suggestions
  add column if not exists country_code text;

alter table public.epsu_suggestions
  drop constraint if exists epsu_suggestions_country_code_length_check;

alter table public.epsu_suggestions
  add constraint epsu_suggestions_country_code_length_check
  check (country_code is null or char_length(country_code) = 2);

drop function if exists public.fetch_regional_epsu_suggestions();

create function public.fetch_regional_epsu_suggestions()
returns table (
  title text,
  country_code text,
  vote_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    suggestion.title,
    suggestion.country_code,
    count(*)::bigint as vote_count
  from public.epsu_suggestions suggestion
  where public.is_platform_admin()
  group by suggestion.title, suggestion.country_code
  order by count(*) desc, suggestion.title asc;
$$;

grant execute on function public.fetch_regional_epsu_suggestions() to authenticated;
