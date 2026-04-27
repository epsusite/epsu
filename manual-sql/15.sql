create or replace function public.fetch_regional_epsu_suggestions()
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
    and suggestion.status = 'new'
  group by suggestion.title, suggestion.country_code
  order by count(*) desc, suggestion.title asc;
$$;

create or replace function public.review_regional_epsu_suggestion(p_title text, p_country_code text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  update public.epsu_suggestions
  set status = p_status
  where title = p_title
    and (
      (country_code is null and p_country_code is null)
      or country_code = p_country_code
    )
    and status = 'new';

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.fetch_regional_epsu_suggestions() to authenticated;
grant execute on function public.review_regional_epsu_suggestion(text, text, text) to authenticated;
