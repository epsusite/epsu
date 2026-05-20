create or replace function public.kick_epsu_member(p_epsu_id uuid, p_profile_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.kick_school_epsu_member(p_epsu_id, p_profile_id);
$$;

grant execute on function public.kick_epsu_member(uuid, uuid) to authenticated;
