alter table public.app_notifications
  add column if not exists push_sent_at timestamptz,
  add column if not exists push_error text;

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

create index if not exists profile_push_tokens_profile_enabled_idx
  on public.profile_push_tokens (profile_id, enabled);

alter table public.profile_push_tokens enable row level security;

drop policy if exists "profile_push_tokens_select_own" on public.profile_push_tokens;
create policy "profile_push_tokens_select_own"
on public.profile_push_tokens
for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists "profile_push_tokens_insert_own" on public.profile_push_tokens;
create policy "profile_push_tokens_insert_own"
on public.profile_push_tokens
for insert
to authenticated
with check (profile_id = auth.uid());

drop policy if exists "profile_push_tokens_update_own" on public.profile_push_tokens;
create policy "profile_push_tokens_update_own"
on public.profile_push_tokens
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists "profile_push_tokens_delete_own" on public.profile_push_tokens;
create policy "profile_push_tokens_delete_own"
on public.profile_push_tokens
for delete
to authenticated
using (profile_id = auth.uid());

create or replace function public.register_push_token(p_expo_push_token text, p_platform text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_token text;
  normalized_platform text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_token := nullif(trim(p_expo_push_token), '');
  normalized_platform := lower(nullif(trim(p_platform), ''));

  if normalized_token is null then
    raise exception 'Push token required';
  end if;

  if normalized_platform not in ('ios', 'android', 'web') then
    normalized_platform := 'unknown';
  end if;

  insert into public.profile_push_tokens (
    profile_id,
    expo_push_token,
    platform,
    enabled,
    last_seen_at
  )
  values (
    auth.uid(),
    normalized_token,
    normalized_platform,
    true,
    timezone('utc', now())
  )
  on conflict (profile_id, expo_push_token)
  do update set
    platform = excluded.platform,
    enabled = true,
    last_seen_at = timezone('utc', now());

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.unregister_push_token(p_expo_push_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.profile_push_tokens
  set
    enabled = false,
    last_seen_at = timezone('utc', now())
  where profile_id = auth.uid()
    and expo_push_token = nullif(trim(p_expo_push_token), '');

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
