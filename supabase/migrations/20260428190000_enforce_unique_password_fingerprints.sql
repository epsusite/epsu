create table if not exists public.password_fingerprints (
  profile_id uuid primary key references auth.users (id) on delete cascade,
  password_fingerprint text not null unique,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.touch_password_fingerprint_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists password_fingerprints_touch_updated_at on public.password_fingerprints;
create trigger password_fingerprints_touch_updated_at
before update on public.password_fingerprints
for each row
execute function public.touch_password_fingerprint_updated_at();

alter table public.password_fingerprints disable row level security;

revoke all on public.password_fingerprints from anon, authenticated;
