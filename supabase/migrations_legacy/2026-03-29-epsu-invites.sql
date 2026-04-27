create table if not exists public.epsu_invites (
  id uuid primary key default gen_random_uuid(),
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  invite_role text not null check (invite_role in ('member', 'moderator')),
  token text not null unique,
  max_uses integer not null default 1 check (max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_epsu_invites_epsu_role_active
on public.epsu_invites (epsu_id, invite_role, is_active);
