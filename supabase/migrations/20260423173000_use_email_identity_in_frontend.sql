alter table public.profiles
  add column if not exists email text;

update public.profiles profile
set email = lower(auth_user.email)
from auth.users auth_user
where auth_user.id = profile.id
  and auth_user.email is not null
  and profile.email is distinct from lower(auth_user.email);

create unique index if not exists profiles_email_unique_idx
  on public.profiles (lower(email))
  where email is not null;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_username text;
  profile_username text;
  raw_birth_date text;
  raw_country_code text;
  raw_tos_accepted_at text;
begin
  desired_username := nullif(trim(new.raw_user_meta_data->>'username'), '');
  raw_birth_date := nullif(trim(new.raw_user_meta_data->>'date_of_birth'), '');
  raw_country_code := upper(nullif(trim(new.raw_user_meta_data->>'country_code'), ''));
  raw_tos_accepted_at := nullif(trim(new.raw_user_meta_data->>'tos_privacy_accepted_at'), '');

  if desired_username is null or exists (
    select 1
    from public.profiles profile
    where lower(profile.username) = lower(desired_username)
      and profile.id <> new.id
  ) then
    profile_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  else
    profile_username := desired_username;
  end if;

  insert into public.profiles (
    id,
    username,
    email,
    notifications_enabled,
    date_of_birth,
    country_code,
    tos_privacy_accepted_at
  )
  values (
    new.id,
    profile_username,
    lower(new.email),
    false,
    case
      when raw_birth_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raw_birth_date::date
      else null
    end,
    case
      when char_length(raw_country_code) = 2 then raw_country_code
      else null
    end,
    case
      when raw_tos_accepted_at is not null then raw_tos_accepted_at::timestamptz
      else null
    end
  )
  on conflict (id) do update
  set
    username = excluded.username,
    email = excluded.email,
    notifications_enabled = excluded.notifications_enabled,
    date_of_birth = excluded.date_of_birth,
    country_code = excluded.country_code,
    tos_privacy_accepted_at = excluded.tos_privacy_accepted_at;

  return new;
end;
$$;

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
      and lower(coalesce(profile.email, '')) = 'j.truumaa@gmail.com'
  );
$$;

drop function if exists public.fetch_pending_school_epsus();

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
  host_id uuid,
  host_email text
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
    epsu.host_id,
    profile.email as host_email
  from public.epsus epsu
  left join public.profiles profile on profile.id = epsu.host_id
  where public.is_platform_admin()
    and epsu.scope = 'school'
    and epsu.review_status = 'pending'
  order by epsu.created_at asc;
$$;
