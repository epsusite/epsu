-- The unique constraint posts_epsu_id_author_id_release_at_key only allows 1 post
-- per (epsu_id, author_id, release_at), but the business rule is 2 posts per epsu per hour.
-- Drop the unique constraint and replace with a non-unique index for performance.

drop index if exists public.posts_epsu_id_author_id_release_at_key;

create index if not exists posts_epsu_id_author_id_release_at_idx
on public.posts (epsu_id, author_id, release_at);
