create table if not exists public.profile_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_profile_id uuid not null references public.profiles (id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (blocker_profile_id, blocked_profile_id),
  check (blocker_profile_id <> blocked_profile_id)
);

create index if not exists profile_blocks_blocker_created_at_idx
  on public.profile_blocks (blocker_profile_id, created_at desc);

alter table public.profile_blocks enable row level security;

drop policy if exists "profile_blocks_select_own" on public.profile_blocks;
create policy "profile_blocks_select_own"
on public.profile_blocks
for select
to authenticated
using (blocker_profile_id = auth.uid());

drop policy if exists "profile_blocks_insert_own" on public.profile_blocks;
create policy "profile_blocks_insert_own"
on public.profile_blocks
for insert
to authenticated
with check (blocker_profile_id = auth.uid());

create or replace function public.block_post_author(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post public.posts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_post
  from public.posts
  where id = p_post_id;

  if not found then
    raise exception 'Post not found';
  end if;

  if target_post.author_id is null then
    raise exception 'Author unavailable';
  end if;

  if target_post.author_id = auth.uid() then
    raise exception 'You cannot block yourself';
  end if;

  insert into public.profile_blocks (blocker_profile_id, blocked_profile_id)
  values (auth.uid(), target_post.author_id)
  on conflict (blocker_profile_id, blocked_profile_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'blockedAuthorId', target_post.author_id
  );
end;
$$;

create or replace function public.fetch_blocked_author_ids()
returns uuid[]
language sql
security definer
set search_path = public
as $$
  select coalesce(array_agg(blocked_profile_id order by created_at desc), '{}'::uuid[])
  from public.profile_blocks
  where blocker_profile_id = auth.uid();
$$;

grant execute on function public.block_post_author(uuid) to authenticated;
grant execute on function public.fetch_blocked_author_ids() to authenticated;
