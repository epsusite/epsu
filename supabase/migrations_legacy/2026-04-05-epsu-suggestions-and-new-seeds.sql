create table if not exists public.epsu_suggestions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(trim(title)) >= 2),
  details text check (details is null or char_length(details) <= 240),
  status text not null default 'new' check (status in ('new', 'reviewed', 'approved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.epsu_suggestions
drop constraint if exists epsu_suggestions_title_check;

alter table public.epsu_suggestions
add constraint epsu_suggestions_title_check
check (char_length(trim(title)) >= 2);

alter table public.epsus
add column if not exists website text;

alter table public.epsus
add column if not exists review_status text not null default 'approved';

alter table public.epsus
drop constraint if exists epsus_scope_check;

alter table public.epsus
add constraint epsus_scope_check
check (scope in ('city', 'state', 'country', 'school', 'private'));

alter table public.epsus
drop constraint if exists epsus_review_status_check;

alter table public.epsus
add constraint epsus_review_status_check
check (review_status in ('pending', 'approved', 'rejected'));

delete from public.epsus
where slug in (
  'atl-epsu',
  'phoenix-epsu',
  'fort-lauderdale-epsu',
  'bismark-epsu',
  'seattle-epsu',
  'reno-epsu',
  'birmingham-epsu',
  'el-paso-epsu',
  'nyc-epsu',
  'ancourage-epsu'
);

insert into public.epsus (slug, name, code, scope)
values
  ('tallinn-epsu', 'Tallinn Epsu', 'TLN', 'city'),
  ('tartu-epsu', 'Tartu Epsu', 'TRT', 'city'),
  ('parnu-epsu', 'Pärnu Epsu', 'PRN', 'city'),
  ('narva-epsu', 'Narva Epsu', 'NRV', 'city'),
  ('estonia-epsu', 'Estonia Epsu', 'EST', 'country'),
  ('london-epsu', 'London Epsu', 'LDN', 'city'),
  ('england-epsu', 'England Epsu', 'ENG', 'country'),
  ('scotland-epsu', 'Scotland Epsu', 'SCT', 'country')
on conflict (slug) do update
set
  name = excluded.name,
  code = excluded.code,
  scope = excluded.scope;
