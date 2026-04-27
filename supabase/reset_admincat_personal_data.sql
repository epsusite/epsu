do $$
declare
  v_profile_id uuid;
begin
  select id
  into v_profile_id
  from public.profiles
  where username = 'admincat';

  if v_profile_id is null then
    raise exception 'admincat not found';
  end if;

  if to_regclass('public.account_requests') is not null then
    delete from public.account_requests
    where profile_id = v_profile_id;
  end if;

  if to_regclass('public.app_notifications') is not null then
    delete from public.app_notifications
    where profile_id = v_profile_id;
  end if;

  if to_regclass('public.post_reactions') is not null then
    delete from public.post_reactions
    where profile_id = v_profile_id;
  end if;

  if to_regclass('public.post_reports') is not null then
    delete from public.post_reports
    where profile_id = v_profile_id;
  end if;

  if to_regclass('public.epsu_subscriptions') is not null then
    delete from public.epsu_subscriptions
    where profile_id = v_profile_id;
  end if;

  if to_regclass('public.epsu_suggestions') is not null then
    delete from public.epsu_suggestions
    where profile_id = v_profile_id;
  end if;

  if to_regclass('public.epsu_memberships') is not null then
    delete from public.epsu_memberships
    where profile_id = v_profile_id;
  end if;

  if to_regclass('public.epsu_presence') is not null then
    delete from public.epsu_presence
    where profile_id = v_profile_id;
  end if;

  if to_regclass('public.epsu_join_applications') is not null then
    delete from public.epsu_join_applications
    where profile_id = v_profile_id
       or reviewed_by_profile_id = v_profile_id;
  end if;

  if to_regclass('public.posts') is not null then
    update public.posts
    set author_id = null
    where author_id = v_profile_id;
  end if;

  if to_regclass('public.moderation_actions') is not null then
    update public.moderation_actions
    set actor_profile_id = null
    where actor_profile_id = v_profile_id;

    update public.moderation_actions
    set target_profile_id = null
    where target_profile_id = v_profile_id;
  end if;

  update public.profiles
  set
    notifications_enabled = false,
    date_of_birth = null,
    country_code = null,
    tos_privacy_accepted_at = null,
    community_guidelines_accepted_at = null
  where id = v_profile_id;
end
$$;

select
  username,
  is_admin,
  notifications_enabled,
  date_of_birth,
  country_code,
  tos_privacy_accepted_at,
  community_guidelines_accepted_at
from public.profiles
where username = 'admincat';
