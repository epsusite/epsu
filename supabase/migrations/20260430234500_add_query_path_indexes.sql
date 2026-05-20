create index if not exists app_notifications_profile_kind_created_at_idx
  on public.app_notifications (profile_id, kind, created_at desc);

create index if not exists app_notifications_profile_unread_created_at_idx
  on public.app_notifications (profile_id, created_at desc)
  where read_at is null;

create index if not exists epsu_memberships_profile_status_role_epsu_idx
  on public.epsu_memberships (profile_id, status, role, epsu_id);

create index if not exists epsu_memberships_epsu_status_created_profile_idx
  on public.epsu_memberships (epsu_id, status, created_at asc, profile_id);

create index if not exists moderation_actions_epsu_created_at_idx
  on public.moderation_actions (epsu_id, created_at desc);

create index if not exists moderation_actions_actor_created_at_idx
  on public.moderation_actions (actor_profile_id, created_at desc)
  where actor_profile_id is not null;

create index if not exists moderation_actions_target_created_at_idx
  on public.moderation_actions (target_profile_id, created_at desc)
  where target_profile_id is not null;

create index if not exists post_reports_profile_created_at_idx
  on public.post_reports (profile_id, created_at desc);

create index if not exists posts_author_created_at_idx
  on public.posts (author_id, created_at desc)
  where author_id is not null;

create index if not exists epsus_host_created_at_idx
  on public.epsus (host_id, created_at desc)
  where host_id is not null;
