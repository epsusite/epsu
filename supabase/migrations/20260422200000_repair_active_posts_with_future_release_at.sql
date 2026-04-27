update public.posts
set release_at = greatest(created_at, timezone('utc', now()) - interval '1 second'),
    expire_at = greatest(created_at, timezone('utc', now()) - interval '1 second') + interval '24 hours'
where status = 'active'
  and release_at > timezone('utc', now());
