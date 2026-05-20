create or replace function public.fetch_epsu_active_post_counts(p_epsu_ids uuid[])
returns table (
  epsu_id uuid,
  active_post_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    epsu.id as epsu_id,
    count(post.id)::bigint as active_post_count
  from unnest(coalesce(p_epsu_ids, '{}'::uuid[])) as requested_epsu(id)
  join public.epsus epsu on epsu.id = requested_epsu.id
  left join public.posts post
    on post.epsu_id = epsu.id
   and post.status = 'active'
  group by epsu.id;
$$;

grant execute on function public.fetch_epsu_active_post_counts(uuid[]) to authenticated;
