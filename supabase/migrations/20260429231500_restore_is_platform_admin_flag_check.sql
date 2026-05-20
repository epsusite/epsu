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
      and profile.is_admin = true
  );
$$;

grant execute on function public.is_platform_admin(uuid) to authenticated;
