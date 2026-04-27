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

create index if not exists account_requests_profile_id_created_at_idx
  on public.account_requests (profile_id, created_at desc);

alter table public.account_requests enable row level security;

drop policy if exists "account_requests_select_own_or_admin" on public.account_requests;
create policy "account_requests_select_own_or_admin"
on public.account_requests
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_platform_admin()
);

drop policy if exists "account_requests_insert_own" on public.account_requests;
create policy "account_requests_insert_own"
on public.account_requests
for insert
to authenticated
with check (
  profile_id = auth.uid()
);

create or replace function public.delete_school_logo_object(p_logo_path text)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if coalesce(trim(p_logo_path), '') = '' then
    return;
  end if;

  delete from storage.objects
  where bucket_id = 'school-logos'
    and name = trim(p_logo_path);
end;
$$;

create or replace function public.purge_expired_personal_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_notification_count integer := 0;
  deleted_request_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  delete from public.app_notifications
  where profile_id = auth.uid()
    and read_at is not null
    and created_at < timezone('utc', now()) - interval '365 days';

  get diagnostics deleted_notification_count = row_count;

  delete from public.account_requests
  where profile_id = auth.uid()
    and status in ('resolved', 'rejected')
    and created_at < timezone('utc', now()) - interval '365 days';

  get diagnostics deleted_request_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'deletedNotifications', deleted_notification_count,
    'deletedRequests', deleted_request_count
  );
end;
$$;

create or replace function public.review_pending_school_epsu(p_epsu_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
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

  if p_status = 'rejected' and updated_epsu.logo_path is not null then
    perform public.delete_school_logo_object(updated_epsu.logo_path);

    update public.epsus
    set logo_path = null
    where id = updated_epsu.id;

    updated_epsu.logo_path := null;
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

create or replace function public.delete_owned_epsu(p_epsu_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
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

  if not public.is_epsu_owner(p_epsu_id) then
    raise exception 'Owner access required';
  end if;

  insert into public.moderation_actions (actor_profile_id, epsu_id, action_type, details)
  values (
    auth.uid(),
    p_epsu_id,
    'delete_epsu',
    jsonb_build_object('slug', target_epsu.slug, 'name', target_epsu.name, 'scope', target_epsu.scope)
  );

  perform public.delete_school_logo_object(target_epsu.logo_path);

  delete from public.epsus
  where id = p_epsu_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.delete_school_logo_object(text) to authenticated;
grant execute on function public.purge_expired_personal_data() to authenticated;
