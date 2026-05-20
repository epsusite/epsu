create or replace function public.leave_epsu(p_epsu_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
  membership_record public.epsu_memberships%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_epsu
  from public.epsus
  where id = p_epsu_id;

  if not found then
    raise exception 'Epsu not found';
  end if;

  if target_epsu.scope = 'private' then
    raise exception 'Private Epsus cannot be left manually';
  end if;

  select *
  into membership_record
  from public.epsu_memberships
  where epsu_id = p_epsu_id
    and profile_id = auth.uid();

  if not found or membership_record.status not in ('active', 'muted') then
    raise exception 'Membership not found';
  end if;

  if membership_record.role = 'host' then
    raise exception 'Hosts cannot leave here';
  end if;

  update public.epsu_memberships
  set status = 'left',
      muted_until = null
  where id = membership_record.id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.leave_epsu(uuid) to authenticated;

create or replace function public.leave_school_epsu(p_epsu_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.leave_epsu(p_epsu_id);
$$;

grant execute on function public.leave_school_epsu(uuid) to authenticated;
