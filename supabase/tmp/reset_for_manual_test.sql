do $$
declare
  v_admin_id uuid;
begin
  select profile.id
  into v_admin_id
  from public.profiles profile
  where lower(profile.email) = 'epsu.site@protonmail.com'
     or lower(profile.username) = 'admincat'
  order by case when lower(profile.email) = 'epsu.site@protonmail.com' then 0 else 1 end
  limit 1;

  if v_admin_id is null then
    raise exception 'Admin account not found';
  end if;

  delete from public.app_notifications;
  delete from public.post_reactions;
  delete from public.post_reports;
  delete from public.moderation_actions;
  delete from public.profile_push_tokens;
  delete from public.epsu_presence;
  delete from public.epsu_subscriptions;
  delete from public.epsu_trial_submissions;
  delete from public.epsu_suggestions;
  delete from public.epsu_memberships;
  delete from public.posts;
  delete from public.epsu_invites;
  delete from public.epsus;

  if to_regclass('public.profile_blocks') is not null then
    delete from public.profile_blocks;
  end if;

  if to_regclass('public.password_fingerprints') is not null then
    delete from public.password_fingerprints
    where profile_id <> v_admin_id;
  end if;

  update public.profiles
  set
    is_admin = case when id = v_admin_id then true else false end,
    notifications_enabled = false,
    date_of_birth = null,
    country_code = 'EE',
    tos_privacy_accepted_at = null,
    community_guidelines_accepted_at = null
  where id = v_admin_id;

  delete from auth.users
  where id <> v_admin_id;
end
$$;

select
  (select count(*)::int from auth.users) as auth_user_count,
  (select count(*)::int from public.profiles) as profile_count,
  (select count(*)::int from public.epsus) as epsu_count,
  (select count(*)::int from public.epsu_memberships) as membership_count,
  (select count(*)::int from public.posts) as post_count,
  (select count(*)::int from public.post_reports) as report_count,
  (select count(*)::int from public.post_reactions) as reaction_count,
  (select count(*)::int from public.app_notifications) as notification_count,
  (select count(*)::int from public.moderation_actions) as moderation_action_count,
  (select count(*)::int from public.profile_push_tokens) as push_token_count;

select
  id,
  username,
  email,
  is_admin,
  notifications_enabled,
  date_of_birth,
  country_code,
  tos_privacy_accepted_at,
  community_guidelines_accepted_at
from public.profiles
order by created_at asc;
