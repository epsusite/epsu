drop function if exists public.fetch_all_queued_posts();

create or replace function public.fetch_all_queued_posts()
returns table (
  id uuid,
  epsu_id uuid,
  epsu_name text,
  number integer,
  title text,
  body text,
  author_id uuid,
  reply_to_post_id uuid,
  release_at timestamptz,
  created_at timestamptz,
  keyword_reviewed_at timestamptz,
  flagged_keywords text[]
)
language sql
security definer
set search_path = public
as $$
  select
    post_record.id,
    post_record.epsu_id,
    epsu.name as epsu_name,
    post_record.number,
    post_record.title,
    post_record.body,
    post_record.author_id,
    post_record.reply_to_post_id,
    post_record.release_at,
    post_record.created_at,
    post_record.keyword_reviewed_at,
    coalesce(post_record.flagged_keywords, '{}'::text[]) as flagged_keywords
  from public.posts post_record
  join public.epsus epsu on epsu.id = post_record.epsu_id
  where public.is_platform_admin()
    and post_record.status = 'queued'
  order by post_record.release_at asc nulls last, post_record.created_at asc, epsu.name asc, post_record.number asc;
$$;

grant execute on function public.fetch_all_queued_posts() to authenticated;
