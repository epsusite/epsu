create extension if not exists "pgcrypto";
create extension if not exists pg_net;

-- Current bootstrap snapshot for the live public tables.
-- Policies, RPCs, and later behavioral changes still live in the migration files.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 20),
  email text unique,
  is_admin boolean not null default false,
  notifications_enabled boolean not null default false,
  date_of_birth date,
  country_code text check (country_code is null or char_length(country_code) = 2),
  tos_privacy_accepted_at timestamptz,
  community_guidelines_accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.epsus (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  code text not null check (char_length(code) between 1 and 3),
  scope text not null default 'city' check (scope in ('city', 'state', 'country', 'school', 'private')),
  membership_cap integer,
  host_id uuid references public.profiles (id) on delete set null,
  website text,
  logo_path text,
  review_status text not null default 'approved' check (review_status in ('pending', 'approved', 'rejected')),
  is_rentable boolean not null default false,
  annual_price_usd integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  country_code text check (country_code is null or char_length(country_code) = 2)
);

create table if not exists public.epsu_memberships (
  id uuid primary key default gen_random_uuid(),
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'host', 'moderator')),
  status text not null default 'active' check (status in ('active', 'muted', 'left', 'invited', 'kicked')),
  created_at timestamptz not null default timezone('utc', now()),
  muted_until timestamptz,
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
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  target_profile_id uuid references public.profiles (id) on delete set null,
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  action_type text not null check (
    action_type in (
      'dismiss_report',
      'mute_author_24h',
      'remove_post',
      'change_member_role',
      'change_member_status',
      'kick_school_member',
      'generate_invite',
      'redeem_invite',
      'delete_epsu',
      'review_school_application'
    )
  ),
  details jsonb not null default '{}'::jsonb,
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

create table if not exists public.epsu_suggestions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(trim(title)) >= 2),
  country_code text check (country_code is null or char_length(country_code) = 2),
  details text check (details is null or char_length(details) <= 240),
  status text not null default 'new' check (status in ('new', 'reviewed', 'approved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now())
);

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

create or replace function public.delete_hosted_epsu(p_epsu_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_epsu
  from public.epsus
  where id = p_epsu_id;

  if not found then
    raise exception 'Epsu not found';
  end if;

  if not public.is_epsu_host(p_epsu_id) and not public.is_platform_admin() then
    raise exception 'Host access required';
  end if;

  insert into public.moderation_actions (actor_profile_id, epsu_id, action_type, details)
  values (
    auth.uid(),
    p_epsu_id,
    'delete_epsu',
    jsonb_build_object('slug', target_epsu.slug, 'name', target_epsu.name, 'scope', target_epsu.scope)
  );

  delete from public.epsus
  where id = p_epsu_id;

  return jsonb_build_object('ok', true);
end;
$$;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  related_epsu_id uuid references public.epsus (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz,
  push_sent_at timestamptz,
  push_error text,
  push_ticket_ids jsonb,
  push_receipts_checked_at timestamptz
);

create table if not exists public.app_runtime_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.request_push_delivery_for_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_secret text;
begin
  select secret.value
  into delivery_secret
  from public.app_runtime_secrets secret
  where secret.key = 'push_delivery_secret';

  if delivery_secret is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://xzgzzuxmtjrppavvynuy.supabase.co/functions/v1/send-push-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-epsu-push-secret', delivery_secret
    ),
    body := '{}'::jsonb
  );
end;
$$;

create or replace function public.trigger_push_delivery_for_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.request_push_delivery_for_notifications();
  return null;
end;
$$;

create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  request_type text not null check (request_type in ('correction')),
  message text not null check (char_length(trim(message)) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'rejected')),
  resolution_note text,
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz
);

create or replace function public.release_queued_posts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
  current_hour timestamptz;
begin
  current_hour := date_trunc('hour', timezone('utc', now()));

  update public.posts
  set status = 'active'
  where status = 'queued'
    and keyword_reviewed_at is not null
    and release_at <= timezone('utc', now());

  get diagnostics released_count = row_count;

  if released_count > 0 then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    select distinct
      membership.profile_id,
      'fullhour_post',
      'New Posts',
      'See them now!',
      null::uuid
    from public.epsu_memberships membership
    where membership.role in ('member', 'moderator', 'host')
      and membership.status = 'active'
      and not exists (
        select 1
        from public.app_notifications notification
        where notification.profile_id = membership.profile_id
          and notification.kind = 'fullhour_post'
          and notification.created_at >= current_hour
          and notification.created_at < current_hour + interval '1 hour'
      );
  end if;

  return jsonb_build_object('ok', true, 'releasedCount', released_count);
end;
$$;

create or replace function public.release_queued_posts_now()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
  released_at_now timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Administrator access required';
  end if;

  released_at_now := timezone('utc', now());

  update public.posts
  set status = 'active',
      release_at = released_at_now,
      expire_at = released_at_now + interval '24 hours'
  where status = 'queued'
    and keyword_reviewed_at is not null;

  get diagnostics released_count = row_count;

  if released_count > 0 then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    select distinct
      membership.profile_id,
      'fullhour_post',
      'New Posts',
      'See them now!',
      null::uuid
    from public.epsu_memberships membership
    where membership.role in ('member', 'moderator', 'host')
      and membership.status = 'active';
  end if;

  return jsonb_build_object('ok', true, 'releasedCount', released_count);
end;
$$;

create table if not exists public.epsu_join_applications (
  id uuid primary key default gen_random_uuid(),
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  answer text not null check (char_length(trim(answer)) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by_profile_id uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (epsu_id, profile_id)
);

create table if not exists public.epsu_presence (
  epsu_id uuid not null references public.epsus (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default timezone('utc', now()),
  primary key (epsu_id, profile_id)
);

create table if not exists public.profile_push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android', 'web', 'unknown')),
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, expo_push_token)
);

create index if not exists account_requests_profile_id_created_at_idx
  on public.account_requests (profile_id, created_at desc);

create index if not exists idx_epsu_invites_epsu_role_active
  on public.epsu_invites (epsu_id, invite_role, is_active);

create index if not exists idx_epsu_presence_last_seen_at
  on public.epsu_presence (last_seen_at desc);

create index if not exists profile_push_tokens_profile_enabled_idx
  on public.profile_push_tokens (profile_id, enabled);

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

drop trigger if exists set_epsu_join_applications_updated_at on public.epsu_join_applications;
create trigger set_epsu_join_applications_updated_at
before update on public.epsu_join_applications
for each row
execute procedure public.set_updated_at();

insert into public.epsus (slug, name, code, scope, country_code)
values
  ('tallinn-epsu', 'Tallinn Epsu', 'TLN', 'city', 'EE'),
  ('tartu-epsu', 'Tartu Epsu', 'TRT', 'city', 'EE'),
  ('parnu-epsu', 'Parnu Epsu', 'PRN', 'city', 'EE'),
  ('narva-epsu', 'Narva Epsu', 'NRV', 'city', 'EE'),
  ('estonia-epsu', 'Estonia Epsu', 'EST', 'country', 'EE'),
  ('london-epsu', 'London Epsu', 'LDN', 'city', 'GB'),
  ('england-epsu', 'England Epsu', 'ENG', 'country', 'GB'),
  ('scotland-epsu', 'Scotland Epsu', 'SCT', 'country', 'GB')
on conflict (slug) do nothing;
