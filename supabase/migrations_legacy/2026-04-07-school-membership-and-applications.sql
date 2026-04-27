alter table public.epsus
  add column if not exists country_code text check (country_code is null or char_length(country_code) = 2);

update public.epsus
set country_code = case
  when slug in ('estonia-epsu', 'tallinn-epsu', 'tartu-epsu', 'parnu-epsu', 'narva-epsu') then 'EE'
  when slug in ('england-epsu', 'scotland-epsu', 'london-epsu') then 'GB'
  else country_code
end
where country_code is null;

alter table public.epsu_memberships
  drop constraint if exists epsu_memberships_status_check;

alter table public.epsu_memberships
  add constraint epsu_memberships_status_check
  check (status in ('active', 'muted', 'left', 'invited', 'kicked'));

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

drop trigger if exists set_epsu_join_applications_updated_at on public.epsu_join_applications;
create trigger set_epsu_join_applications_updated_at
before update on public.epsu_join_applications
for each row
execute procedure public.set_updated_at();

alter table public.epsu_join_applications enable row level security;

drop policy if exists "epsu_join_applications_select_scope" on public.epsu_join_applications;
create policy "epsu_join_applications_select_scope"
on public.epsu_join_applications
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_epsu_owner(epsu_id)
);

drop policy if exists "epsu_join_applications_insert_own" on public.epsu_join_applications;
create policy "epsu_join_applications_insert_own"
on public.epsu_join_applications
for insert
to authenticated
with check (profile_id = auth.uid());

drop policy if exists "epsu_join_applications_update_scope" on public.epsu_join_applications;
create policy "epsu_join_applications_update_scope"
on public.epsu_join_applications
for update
to authenticated
using (
  profile_id = auth.uid()
  or public.is_epsu_owner(epsu_id)
)
with check (
  profile_id = auth.uid()
  or public.is_epsu_owner(epsu_id)
);

create or replace function public.ensure_regional_memberships(p_country_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_country_code text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_country_code := upper(trim(coalesce(p_country_code, '')));

  if char_length(normalized_country_code) <> 2 then
    return jsonb_build_object('ok', false);
  end if;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status)
  select epsu.id, auth.uid(), 'member', 'active'
  from public.epsus epsu
  where epsu.scope in ('country', 'state', 'city')
    and epsu.country_code = normalized_country_code
    and not exists (
      select 1
      from public.epsu_memberships membership
      where membership.epsu_id = epsu.id
        and membership.profile_id = auth.uid()
        and membership.status = 'kicked'
    )
  on conflict (epsu_id, profile_id)
  do update set
    status = case
      when public.epsu_memberships.status = 'kicked' then public.epsu_memberships.status
      else 'active'
    end,
    muted_until = case
      when public.epsu_memberships.status = 'kicked' then public.epsu_memberships.muted_until
      else null
    end;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.apply_to_school_epsu(p_epsu_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
  membership_record public.epsu_memberships%rowtype;
  active_school_membership_count integer;
  application_record public.epsu_join_applications%rowtype;
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

  if target_epsu.scope <> 'school' then
    raise exception 'Only school Epsus accept applications';
  end if;

  if char_length(trim(coalesce(p_answer, ''))) < 10 or char_length(trim(coalesce(p_answer, ''))) > 1000 then
    raise exception 'Application answer must be between 10 and 1000 characters';
  end if;

  select *
  into membership_record
  from public.epsu_memberships
  where epsu_id = p_epsu_id
    and profile_id = auth.uid();

  if found then
    if membership_record.status = 'kicked' then
      raise exception 'You were removed from this Epsu';
    end if;

    if membership_record.status in ('active', 'muted') then
      raise exception 'You are already in this Epsu';
    end if;
  end if;

  select count(*)
  into active_school_membership_count
  from public.epsu_memberships membership
  join public.epsus epsu on epsu.id = membership.epsu_id
  where membership.profile_id = auth.uid()
    and membership.status in ('active', 'muted')
    and membership.role <> 'owner'
    and epsu.scope = 'school';

  if active_school_membership_count >= 3 then
    raise exception 'You can only be in three school Epsus at once';
  end if;

  insert into public.epsu_join_applications (epsu_id, profile_id, answer, status, reviewed_by_profile_id, reviewed_at)
  values (p_epsu_id, auth.uid(), trim(p_answer), 'pending', null, null)
  on conflict (epsu_id, profile_id)
  do update set
    answer = excluded.answer,
    status = 'pending',
    reviewed_by_profile_id = null,
    reviewed_at = null
  returning * into application_record;

  return jsonb_build_object(
    'ok', true,
    'applicationId', application_record.id,
    'status', application_record.status
  );
end;
$$;

create or replace function public.review_school_application(p_application_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  application_record public.epsu_join_applications%rowtype;
  target_epsu public.epsus%rowtype;
  active_school_membership_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid application status';
  end if;

  select *
  into application_record
  from public.epsu_join_applications
  where id = p_application_id;

  if not found then
    raise exception 'Application not found';
  end if;

  select *
  into target_epsu
  from public.epsus
  where id = application_record.epsu_id;

  if not found or target_epsu.scope <> 'school' then
    raise exception 'School Epsu not found';
  end if;

  if not public.is_epsu_owner(application_record.epsu_id) then
    raise exception 'Owner access required';
  end if;

  if p_status = 'approved' then
    if exists (
      select 1
      from public.epsu_memberships membership
      where membership.epsu_id = application_record.epsu_id
        and membership.profile_id = application_record.profile_id
        and membership.status = 'kicked'
    ) then
      raise exception 'Removed users cannot rejoin this Epsu';
    end if;

    select count(*)
    into active_school_membership_count
    from public.epsu_memberships membership
    join public.epsus epsu on epsu.id = membership.epsu_id
    where membership.profile_id = application_record.profile_id
      and membership.status in ('active', 'muted')
      and membership.role <> 'owner'
      and epsu.scope = 'school';

    if active_school_membership_count >= 3 then
      raise exception 'Applicant already has three school Epsus';
    end if;

    insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
    values (application_record.epsu_id, application_record.profile_id, 'member', 'active', null)
    on conflict (epsu_id, profile_id)
    do update set
      role = 'member',
      status = 'active',
      muted_until = null;
  end if;

  update public.epsu_join_applications
  set status = p_status,
      reviewed_by_profile_id = auth.uid(),
      reviewed_at = timezone('utc', now())
  where id = p_application_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.leave_school_epsu(p_epsu_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
  membership_record public.epsu_memberships%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_epsu
  from public.epsus
  where id = p_epsu_id;

  if not found or target_epsu.scope <> 'school' then
    raise exception 'Only school Epsus can be left manually';
  end if;

  select *
  into membership_record
  from public.epsu_memberships
  where epsu_id = p_epsu_id
    and profile_id = auth.uid();

  if not found or membership_record.status not in ('active', 'muted') then
    raise exception 'Membership not found';
  end if;

  if membership_record.role = 'owner' then
    raise exception 'Owners cannot leave here';
  end if;

  update public.epsu_memberships
  set status = 'left',
      muted_until = null
  where id = membership_record.id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.kick_school_epsu_member(p_epsu_id uuid, p_profile_id uuid)
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

  if not found or target_epsu.scope <> 'school' then
    raise exception 'Only school Epsus support owner kicks';
  end if;

  if not public.is_epsu_owner(p_epsu_id) then
    raise exception 'Owner access required';
  end if;

  if exists (
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = p_epsu_id
      and membership.profile_id = p_profile_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise exception 'Owners cannot be kicked';
  end if;

  update public.epsu_memberships
  set status = 'kicked',
      muted_until = null
  where epsu_id = p_epsu_id
    and profile_id = p_profile_id;

  update public.epsu_join_applications
  set status = 'rejected',
      reviewed_by_profile_id = auth.uid(),
      reviewed_at = timezone('utc', now())
  where epsu_id = p_epsu_id
    and profile_id = p_profile_id
    and status = 'pending';

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.create_school_epsu(
  p_school_name text,
  p_code text,
  p_slug text,
  p_website text,
  p_country_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_epsu public.epsus%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.epsus (slug, name, code, scope, website, review_status, country_code)
  values (p_slug, p_school_name, p_code, 'school', p_website, 'pending', upper(trim(p_country_code)))
  returning * into created_epsu;

  return jsonb_build_object(
    'id', created_epsu.id,
    'slug', created_epsu.slug,
    'name', created_epsu.name,
    'code', created_epsu.code,
    'scope', created_epsu.scope,
    'website', created_epsu.website,
    'review_status', created_epsu.review_status,
    'country_code', created_epsu.country_code
  );
end;
$$;

grant execute on function public.ensure_regional_memberships(text) to authenticated;
grant execute on function public.apply_to_school_epsu(uuid, text) to authenticated;
grant execute on function public.review_school_application(uuid, text) to authenticated;
grant execute on function public.leave_school_epsu(uuid) to authenticated;
grant execute on function public.kick_school_epsu_member(uuid, uuid) to authenticated;
grant execute on function public.create_school_epsu(text, text, text, text, text) to authenticated;
