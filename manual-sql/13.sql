create or replace function public.fetch_regional_epsu_suggestions()
returns table (
  id uuid,
  profile_id uuid,
  title text,
  details text,
  status text,
  created_at timestamptz,
  username text
)
language sql
security definer
set search_path = public
as $$
  select
    suggestion.id,
    suggestion.profile_id,
    suggestion.title,
    suggestion.details,
    suggestion.status,
    suggestion.created_at,
    profile.username
  from public.epsu_suggestions suggestion
  left join public.profiles profile on profile.id = suggestion.profile_id
  where public.is_platform_admin()
  order by suggestion.created_at desc;
$$;

grant execute on function public.fetch_regional_epsu_suggestions() to authenticated;
