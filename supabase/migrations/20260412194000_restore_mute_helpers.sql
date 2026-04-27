alter table public.epsu_memberships
  add column if not exists muted_until timestamptz;

update public.epsu_memberships
set muted_until = timezone('utc', now()) + interval '24 hours'
where status = 'muted'
  and muted_until is null;

create or replace function public.normalize_expired_mutes(p_profile_id uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.epsu_memberships
  set status = 'active',
      muted_until = null
  where status = 'muted'
    and muted_until is not null
    and muted_until <= timezone('utc', now())
    and (
      p_profile_id is null
      or profile_id = p_profile_id
    );
end;
$$;

create or replace function public.is_epsu_muted(
  target_epsu_id uuid,
  target_profile_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.epsu_memberships membership
    where membership.epsu_id = target_epsu_id
      and membership.profile_id = target_profile_id
      and membership.status = 'muted'
      and (
        membership.muted_until is null
        or membership.muted_until > timezone('utc', now())
      )
  );
$$;

grant execute on function public.normalize_expired_mutes(uuid) to authenticated;
grant execute on function public.is_epsu_muted(uuid, uuid) to authenticated;
