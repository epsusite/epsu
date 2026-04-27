drop policy if exists "posts_select_own_history" on public.posts;
create policy "posts_select_own_history"
on public.posts
for select
to authenticated
using (author_id = auth.uid());

drop policy if exists "moderation_actions_select_self" on public.moderation_actions;
create policy "moderation_actions_select_self"
on public.moderation_actions
for select
to authenticated
using (
  actor_profile_id = auth.uid()
  or target_profile_id = auth.uid()
);
