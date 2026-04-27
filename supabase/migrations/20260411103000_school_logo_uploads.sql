alter table public.epsus
  add column if not exists logo_path text;

insert into storage.buckets (id, name, public)
values ('school-logos', 'school-logos', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "school_logos_public_read" on storage.objects;
create policy "school_logos_public_read"
on storage.objects
for select
to public
using (bucket_id = 'school-logos');

drop policy if exists "school_logos_authenticated_insert" on storage.objects;
create policy "school_logos_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'school-logos'
  and (storage.foldername(name))[1] = 'epsus'
);

drop policy if exists "school_logos_authenticated_delete" on storage.objects;
create policy "school_logos_authenticated_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'school-logos'
  and (storage.foldername(name))[1] = 'epsus'
);

create or replace function public.create_school_epsu(
  p_school_name text,
  p_code text,
  p_slug text,
  p_website text,
  p_country_code text,
  p_logo_path text
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

  if coalesce(trim(p_logo_path), '') = '' then
    raise exception 'School logo required';
  end if;

  insert into public.epsus (slug, name, code, scope, website, logo_path, review_status, country_code, owner_id)
  values (
    p_slug,
    p_school_name,
    p_code,
    'school',
    p_website,
    trim(p_logo_path),
    'pending',
    upper(trim(p_country_code)),
    auth.uid()
  )
  returning * into created_epsu;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
  values (created_epsu.id, auth.uid(), 'owner', 'active', null)
  on conflict (epsu_id, profile_id)
  do update set
    role = 'owner',
    status = 'active',
    muted_until = null;

  return jsonb_build_object(
    'id', created_epsu.id,
    'slug', created_epsu.slug,
    'name', created_epsu.name,
    'code', created_epsu.code,
    'scope', created_epsu.scope,
    'website', created_epsu.website,
    'logo_path', created_epsu.logo_path,
    'review_status', created_epsu.review_status,
    'country_code', created_epsu.country_code,
    'owner_id', created_epsu.owner_id
  );
end;
$$;

drop function if exists public.fetch_pending_school_epsus();

create function public.fetch_pending_school_epsus()
returns table (
  id uuid,
  slug text,
  name text,
  code text,
  website text,
  logo_path text,
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
    epsu.logo_path,
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

drop function if exists public.create_school_epsu(text, text, text, text, text);

grant execute on function public.create_school_epsu(text, text, text, text, text, text) to authenticated;
grant execute on function public.fetch_pending_school_epsus() to authenticated;

create or replace function public.apply_to_school_epsu(p_epsu_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
  membership_record public.epsu_memberships%rowtype;
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

grant execute on function public.apply_to_school_epsu(uuid, text) to authenticated;
grant execute on function public.review_school_application(uuid, text) to authenticated;
