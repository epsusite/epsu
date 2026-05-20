create or replace function public.fetch_guest_epsus(p_country_code text)
returns table (
  id uuid,
  slug text,
  name text,
  code text,
  scope text,
  website text,
  review_status text,
  country_code text,
  logo_path text,
  member_count bigint,
  online_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_epsus as (
    select
      epsu.id,
      epsu.slug,
      epsu.name,
      epsu.code,
      epsu.scope,
      epsu.website,
      epsu.review_status,
      epsu.country_code,
      epsu.logo_path
    from public.epsus epsu
    where epsu.review_status = 'approved'
      and epsu.scope in ('country', 'state', 'city', 'school')
      and epsu.country_code = upper(trim(coalesce(p_country_code, '')))
  ),
  member_profiles as (
    select membership.epsu_id, membership.profile_id
    from public.epsu_memberships membership
    where membership.status = 'active'
      and membership.epsu_id in (select epsu.id from visible_epsus epsu)
    union
    select epsu.id as epsu_id, epsu.host_id as profile_id
    from public.epsus epsu
    where epsu.host_id is not null
      and epsu.id in (select visible.id from visible_epsus visible)
  ),
  member_counts as (
    select
      member_profiles.epsu_id,
      count(*)::bigint as member_count
    from member_profiles
    group by member_profiles.epsu_id
  ),
  online_counts as (
    select
      presence.epsu_id,
      count(*)::bigint as online_count
    from public.epsu_presence presence
    where presence.epsu_id in (select epsu.id from visible_epsus epsu)
    group by presence.epsu_id
  )
  select
    epsu.id,
    epsu.slug,
    epsu.name,
    epsu.code,
    epsu.scope,
    epsu.website,
    epsu.review_status,
    epsu.country_code,
    epsu.logo_path,
    coalesce(member_counts.member_count, 0)::bigint as member_count,
    coalesce(online_counts.online_count, 0)::bigint as online_count
  from visible_epsus epsu
  left join member_counts on member_counts.epsu_id = epsu.id
  left join online_counts on online_counts.epsu_id = epsu.id
  order by coalesce(member_counts.member_count, 0) desc, epsu.name asc;
$$;

create or replace function public.fetch_guest_posts(p_epsu_ids uuid[] default null)
returns table (
  id uuid,
  epsu_id uuid,
  author_id uuid,
  number integer,
  title text,
  body text,
  like_count integer,
  dislike_count integer,
  reply_to_post_id uuid,
  release_at timestamptz,
  expire_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    post_record.id,
    post_record.epsu_id,
    post_record.author_id,
    post_record.number,
    post_record.title,
    post_record.body,
    post_record.like_count,
    post_record.dislike_count,
    post_record.reply_to_post_id,
    post_record.release_at,
    post_record.expire_at
  from public.posts post_record
  join public.epsus epsu on epsu.id = post_record.epsu_id
  where post_record.status = 'active'
    and epsu.review_status = 'approved'
    and epsu.scope in ('country', 'state', 'city', 'school')
    and (
      p_epsu_ids is null
      or cardinality(p_epsu_ids) = 0
      or post_record.epsu_id = any(p_epsu_ids)
    )
  order by post_record.release_at asc, post_record.number asc;
$$;

grant execute on function public.fetch_guest_epsus(text) to anon;
grant execute on function public.fetch_guest_epsus(text) to authenticated;
grant execute on function public.fetch_guest_posts(uuid[]) to anon;
grant execute on function public.fetch_guest_posts(uuid[]) to authenticated;
