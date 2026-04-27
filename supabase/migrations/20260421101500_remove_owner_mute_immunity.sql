create or replace function public.mute_epsu_member(p_profile_id uuid, p_epsu_id uuid, p_post_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mute_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_epsu_moderator(p_epsu_id) then
    raise exception 'Moderator access required';
  end if;

  mute_until := timezone('utc', now()) + interval '24 hours';

  update public.epsu_memberships
  set status = 'muted',
      muted_until = mute_until
  where epsu_id = p_epsu_id
    and profile_id = p_profile_id;

  update public.post_reports
  set status = 'resolved'
  where post_id = p_post_id
    and status = 'open';

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, post_id, action_type, details)
  values (
    auth.uid(),
    p_profile_id,
    p_epsu_id,
    p_post_id,
    'mute_author_24h',
    '{}'::jsonb
  );

  return jsonb_build_object('ok', true, 'muteUntil', mute_until);
end;
$$;
