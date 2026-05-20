create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_profile public.profiles%rowtype;
  desired_username text;
  profile_username text;
  raw_birth_date text;
  raw_country_code text;
  raw_tos_accepted_at text;
  next_birth_date date;
  next_country_code text;
  next_tos_accepted_at timestamptz;
begin
  select *
  into existing_profile
  from public.profiles profile
  where profile.id = new.id;

  desired_username := nullif(trim(new.raw_user_meta_data->>'username'), '');
  raw_birth_date := nullif(trim(new.raw_user_meta_data->>'date_of_birth'), '');
  raw_country_code := upper(nullif(trim(new.raw_user_meta_data->>'country_code'), ''));
  raw_tos_accepted_at := nullif(trim(new.raw_user_meta_data->>'tos_privacy_accepted_at'), '');

  next_birth_date := case
    when raw_birth_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raw_birth_date::date
    else null
  end;

  next_country_code := case
    when char_length(raw_country_code) = 2 then raw_country_code
    else null
  end;

  next_tos_accepted_at := case
    when raw_tos_accepted_at is not null then raw_tos_accepted_at::timestamptz
    else null
  end;

  if existing_profile.id is not null and existing_profile.username is not null then
    profile_username := existing_profile.username;
  elsif desired_username is null or exists (
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
    coalesce(existing_profile.notifications_enabled, false),
    coalesce(next_birth_date, existing_profile.date_of_birth),
    coalesce(next_country_code, existing_profile.country_code),
    coalesce(next_tos_accepted_at, existing_profile.tos_privacy_accepted_at)
  )
  on conflict (id) do update
  set
    username = case
      when public.profiles.username is not null then public.profiles.username
      else excluded.username
    end,
    email = excluded.email,
    date_of_birth = coalesce(excluded.date_of_birth, public.profiles.date_of_birth),
    country_code = coalesce(excluded.country_code, public.profiles.country_code),
    tos_privacy_accepted_at = coalesce(excluded.tos_privacy_accepted_at, public.profiles.tos_privacy_accepted_at);

  return new;
end;
$$;

drop trigger if exists create_profile_after_auth_user_insert on auth.users;
create trigger create_profile_after_auth_user_insert
after insert on auth.users
for each row
execute function public.sync_profile_from_auth_user();

drop trigger if exists sync_profile_after_auth_user_update on auth.users;
create trigger sync_profile_after_auth_user_update
after update of email, raw_user_meta_data on auth.users
for each row
execute function public.sync_profile_from_auth_user();

update public.profiles profile
set
  email = coalesce(lower(auth_user.email), profile.email),
  date_of_birth = coalesce(
    case
      when nullif(trim(auth_user.raw_user_meta_data->>'date_of_birth'), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then nullif(trim(auth_user.raw_user_meta_data->>'date_of_birth'), '')::date
      else null
    end,
    profile.date_of_birth
  ),
  country_code = coalesce(
    case
      when char_length(upper(nullif(trim(auth_user.raw_user_meta_data->>'country_code'), ''))) = 2
        then upper(nullif(trim(auth_user.raw_user_meta_data->>'country_code'), ''))
      else null
    end,
    profile.country_code
  ),
  tos_privacy_accepted_at = coalesce(
    case
      when nullif(trim(auth_user.raw_user_meta_data->>'tos_privacy_accepted_at'), '') is not null
        then nullif(trim(auth_user.raw_user_meta_data->>'tos_privacy_accepted_at'), '')::timestamptz
      else null
    end,
    profile.tos_privacy_accepted_at
  )
from auth.users auth_user
where auth_user.id = profile.id;

update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('country_code', 'EE')
where lower(email) = 'epsu.site@protonmail.com'
  and char_length(upper(nullif(trim(raw_user_meta_data->>'country_code'), ''))) is distinct from 2;

update public.profiles
set country_code = 'EE'
where lower(coalesce(email, '')) = 'epsu.site@protonmail.com'
  and country_code is null;
