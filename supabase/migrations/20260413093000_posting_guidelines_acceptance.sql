alter table public.profiles
  add column if not exists community_guidelines_accepted_at timestamptz;
