alter table public.profiles
  add column if not exists is_admin boolean not null default false;

update public.profiles
set is_admin = true
where lower(username) = 'admincat';

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  related_epsu_id uuid references public.epsus (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz
);

create index if not exists app_notifications_profile_id_created_at_idx
  on public.app_notifications (profile_id, created_at desc);

alter table public.app_notifications enable row level security;

drop policy if exists "app_notifications_select_own" on public.app_notifications;
create policy "app_notifications_select_own"
on public.app_notifications
for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists "app_notifications_update_own" on public.app_notifications;
create policy "app_notifications_update_own"
on public.app_notifications
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create or replace function public.is_platform_admin(target_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = target_profile_id
      and profile.is_admin = true
  );
$$;

create or replace function public.fetch_pending_school_epsus()
returns table (
  id uuid,
  slug text,
  name text,
  code text,
  website text,
  country_code text,
  review_status text,
  created_at timestamptz,
  owner_id uuid,
  owner_username text
)
language sql
security definer
set search_path = public
as $$
  select
    epsu.id,
    epsu.slug,
    epsu.name,
    epsu.code,
    epsu.website,
    epsu.country_code,
    epsu.review_status,
    epsu.created_at,
    epsu.owner_id,
    profile.username as owner_username
  from public.epsus epsu
  left join public.profiles profile on profile.id = epsu.owner_id
  where public.is_platform_admin()
    and epsu.scope = 'school'
    and epsu.review_status = 'pending'
  order by epsu.created_at asc;
$$;

create or replace function public.review_pending_school_epsu(p_epsu_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_epsu public.epsus%rowtype;
  notification_title text;
  notification_body text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  update public.epsus
  set review_status = p_status
  where id = p_epsu_id
    and scope = 'school'
    and review_status = 'pending'
  returning * into updated_epsu;

  if not found then
    raise exception 'Pending school Epsu not found';
  end if;

  if p_status = 'approved' and updated_epsu.owner_id is not null then
    insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
    values (updated_epsu.id, updated_epsu.owner_id, 'owner', 'active', null)
    on conflict (epsu_id, profile_id)
    do update set
      role = 'owner',
      status = 'active',
      muted_until = null;
  end if;

  notification_title := case
    when p_status = 'approved' then 'School Epsu approved'
    else 'School Epsu rejected'
  end;

  notification_body := case
    when p_status = 'approved' then format('Congratulations, your Epsu "%s" has been approved and is live!', updated_epsu.name)
    else format('Sorry, your Epsu "%s" has been rejected.', updated_epsu.name)
  end;

  if updated_epsu.owner_id is not null then
    insert into public.app_notifications (profile_id, kind, title, body, related_epsu_id)
    values (updated_epsu.owner_id, 'school_review', notification_title, notification_body, updated_epsu.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', updated_epsu.id,
    'review_status', updated_epsu.review_status
  );
end;
$$;

create or replace function public.fetch_unread_app_notifications()
returns table (
  id uuid,
  kind text,
  title text,
  body text,
  related_epsu_id uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    notification.id,
    notification.kind,
    notification.title,
    notification.body,
    notification.related_epsu_id,
    notification.created_at
  from public.app_notifications notification
  left join public.epsus epsu on epsu.id = notification.related_epsu_id
  left join public.profiles profile on profile.id = auth.uid()
  where notification.profile_id = auth.uid()
    and notification.read_at is null
    and (
      notification.related_epsu_id is null
      or epsu.scope not in ('country', 'state', 'city')
      or epsu.country_code = profile.country_code
    )
  order by notification.created_at asc;
$$;

create or replace function public.mark_app_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.app_notifications
  set read_at = timezone('utc', now())
  where id = p_notification_id
    and profile_id = auth.uid()
    and read_at is null;

  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists public.create_school_epsu(text, text, text, text);

grant execute on function public.is_platform_admin(uuid) to authenticated;
grant execute on function public.fetch_pending_school_epsus() to authenticated;
grant execute on function public.review_pending_school_epsu(uuid, text) to authenticated;
grant execute on function public.fetch_unread_app_notifications() to authenticated;
grant execute on function public.mark_app_notification_read(uuid) to authenticated;
