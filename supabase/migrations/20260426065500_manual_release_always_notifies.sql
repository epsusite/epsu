create or replace function public.release_queued_posts_now()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
  released_at_now timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Administrator access required';
  end if;

  released_at_now := timezone('utc', now());

  update public.posts
  set status = 'active',
      release_at = released_at_now,
      expire_at = released_at_now + interval '24 hours'
  where status = 'queued'
    and keyword_reviewed_at is not null;

  get diagnostics released_count = row_count;

  if released_count > 0 then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    select distinct
      membership.profile_id,
      'fullhour_post',
      'New Posts',
      'See them now!',
      null::uuid
    from public.epsu_memberships membership
    where membership.role in ('member', 'moderator', 'host')
      and membership.status = 'active';
  end if;

  return jsonb_build_object('ok', true, 'releasedCount', released_count);
end;
$$;
