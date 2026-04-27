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
