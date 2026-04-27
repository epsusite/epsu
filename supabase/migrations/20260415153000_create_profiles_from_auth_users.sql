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

drop trigger if exists create_profile_after_auth_user_insert on auth.users;
create trigger create_profile_after_auth_user_insert
after insert on auth.users
for each row
execute function public.create_profile_for_auth_user();

insert into public.profiles (
  id,
  username,
  email,
  notifications_enabled,
  date_of_birth,
  country_code,
  tos_privacy_accepted_at
)
select
  auth_user.id,
  case
    when nullif(trim(auth_user.raw_user_meta_data->>'username'), '') is not null
      and not exists (
        select 1
        from public.profiles profile
        where lower(profile.username) = lower(nullif(trim(auth_user.raw_user_meta_data->>'username'), ''))
      )
      then nullif(trim(auth_user.raw_user_meta_data->>'username'), '')
    else 'user_' || substr(replace(auth_user.id::text, '-', ''), 1, 12)
  end,
  lower(auth_user.email),
  false,
  case
    when nullif(trim(auth_user.raw_user_meta_data->>'date_of_birth'), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then nullif(trim(auth_user.raw_user_meta_data->>'date_of_birth'), '')::date
    else null
  end,
  case
    when char_length(upper(nullif(trim(auth_user.raw_user_meta_data->>'country_code'), ''))) = 2
      then upper(nullif(trim(auth_user.raw_user_meta_data->>'country_code'), ''))
    else null
  end,
  case
    when nullif(trim(auth_user.raw_user_meta_data->>'tos_privacy_accepted_at'), '') is not null
      then nullif(trim(auth_user.raw_user_meta_data->>'tos_privacy_accepted_at'), '')::timestamptz
    else null
  end
from auth.users auth_user
where not exists (
  select 1
  from public.profiles profile
  where profile.id = auth_user.id
);
