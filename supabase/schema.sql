create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.epsus (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  code text not null check (char_length(code) between 1 and 3),
  scope text not null default 'city' check (scope in ('city', 'state', 'country', 'private')),
  membership_cap integer,
  owner_id uuid references public.profiles (id) on delete set null,
  is_rentable boolean not null default false,
  annual_price_usd integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.epsu_memberships (
  id uuid primary key default gen_random_uuid(),
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'owner', 'moderator')),
  status text not null default 'active' check (status in ('active', 'muted', 'left', 'invited')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (epsu_id, profile_id)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  number integer not null,
  title text not null,
  body text not null,
  reply_to_post_id uuid references public.posts (id) on delete set null,
  like_count integer not null default 0,
  dislike_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'deleted_by_threshold', 'deleted_by_mod')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (epsu_id, number)
);

create table if not exists public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (post_id, profile_id)
);

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.epsu_subscriptions (
  id uuid primary key default gen_random_uuid(),
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'manual' check (provider in ('manual', 'stripe', 'apple', 'google', 'paypal', 'paddle')),
  external_subscription_id text,
  plan_name text not null,
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due', 'expired')),
  renewal_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute procedure public.set_updated_at();

drop trigger if exists set_epsus_updated_at on public.epsus;
create trigger set_epsus_updated_at
before update on public.epsus
for each row
execute procedure public.set_updated_at();

drop trigger if exists set_posts_updated_at on public.posts;
create trigger set_posts_updated_at
before update on public.posts
for each row
execute procedure public.set_updated_at();

insert into public.epsus (slug, name, code, scope)
values
  ('atl-epsu', 'ATL Epsu', 'ATL', 'city'),
  ('phoenix-epsu', 'Phoenix Epsu', 'PHX', 'city'),
  ('fort-lauderdale-epsu', 'Fort Lauderdale Epsu', 'FTL', 'city'),
  ('bismark-epsu', 'Bismark Epsu', 'BIS', 'city'),
  ('seattle-epsu', 'Seattle Epsu', 'SEA', 'city'),
  ('reno-epsu', 'Reno Epsu', 'RNO', 'city'),
  ('birmingham-epsu', 'Birningham Epsu', 'BHM', 'city'),
  ('el-paso-epsu', 'El Paso Epsu', 'ELP', 'city'),
  ('nyc-epsu', 'NYC Epsu', 'NYC', 'city'),
  ('ancourage-epsu', 'Ancourage Epsu', 'ANC', 'city')
on conflict (slug) do nothing;
