create or replace function public.fetch_unread_app_notifications()
returns table (
  id uuid,
  kind text,
  title text,
  body text,
  related_epsu_id uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    notification.id,
    notification.kind,
    notification.title,
    notification.body,
    notification.related_epsu_id,
    notification.created_at
  from public.app_notifications notification
  left join public.epsus epsu on epsu.id = notification.related_epsu_id
  left join public.profiles profile on profile.id = auth.uid()
  where notification.profile_id = auth.uid()
    and notification.read_at is null
    and (
      notification.kind in ('post_removed', 'author_muted')
      or notification.related_epsu_id is null
      or epsu.scope not in ('country', 'state', 'city')
      or epsu.country_code = profile.country_code
    )
  order by notification.created_at asc;
$$;

create or replace function public.mute_epsu_member(p_profile_id uuid, p_epsu_id uuid, p_post_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mute_until timestamptz;
  normalized_reason text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_epsu_capability(p_epsu_id, 'moderate') then
    raise exception 'Moderator access required';
  end if;

  if p_profile_id is null then
    raise exception 'Post author could not be identified';
  end if;

  perform public.ensure_platform_admin_epsu_membership(p_epsu_id, p_profile_id);

  if not exists (
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = p_epsu_id
      and membership.profile_id = p_profile_id
      and membership.status in ('active', 'muted')
  ) then
    raise exception 'Author is not an active member of this Epsu';
  end if;

  normalized_reason := nullif(trim(coalesce(p_reason, '')), '');
  mute_until := timezone('utc', now()) + interval '24 hours';

  update public.epsu_memberships
  set status = 'muted',
      muted_until = mute_until
  where epsu_id = p_epsu_id
    and profile_id = p_profile_id
    and status in ('active', 'muted');

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type, details)
  values (
    auth.uid(),
    p_profile_id,
    p_epsu_id,
    p_post_id,
    'mute_author_24h',
    jsonb_strip_nulls(jsonb_build_object('reason', normalized_reason))
  );

  insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
  values (
    p_profile_id,
    'author_muted',
    'Muted for 24 hours',
    case
      when normalized_reason is not null then format('A moderator muted you for 24 hours Reason: %s', normalized_reason)
      else 'A moderator muted you for 24 hours'
    end,
    p_epsu_id
  );

  return jsonb_build_object('ok', true, 'muteUntil', mute_until);
end;
$$;
