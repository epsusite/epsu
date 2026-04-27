create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  target_profile_id uuid references public.profiles (id) on delete set null,
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  action_type text not null check (action_type in ('dismiss_report', 'mute_author_24h', 'remove_post')),
  created_at timestamptz not null default timezone('utc', now())
);
