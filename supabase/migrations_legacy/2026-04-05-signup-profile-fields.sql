alter table public.profiles
  add column if not exists date_of_birth date,
  add column if not exists country_code text,
  add column if not exists tos_privacy_accepted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_length_check'
  ) then
    alter table public.profiles
      add constraint profiles_username_length_check
      check (char_length(username) between 3 and 20);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_country_code_length_check'
  ) then
    alter table public.profiles
      add constraint profiles_country_code_length_check
      check (country_code is null or char_length(country_code) = 2);
  end if;
end $$;
