create table if not exists public.auth_handoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  handoff_token text not null unique,
  short_code text not null unique,
  purpose text not null default 'signup_confirm_mobile_login',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists auth_handoffs_user_id_idx
  on public.auth_handoffs (user_id);

create index if not exists auth_handoffs_expires_at_idx
  on public.auth_handoffs (expires_at);

alter table public.auth_handoffs enable row level security;
