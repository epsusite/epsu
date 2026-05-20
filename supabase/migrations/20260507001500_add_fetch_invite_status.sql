create or replace function public.fetch_epsu_invite_status(
  p_epsu_id uuid,
  p_invite_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record public.epsu_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_epsu_host(p_epsu_id) and not public.is_platform_admin() then
    raise exception 'Only hosts or admins can view invites';
  end if;

  if p_invite_role not in ('member', 'moderator') then
    raise exception 'Invalid invite role';
  end if;

  select *
  into invite_record
  from public.epsu_invites
  where epsu_id = p_epsu_id
    and created_by_profile_id = auth.uid()
    and invite_role = p_invite_role
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'token', null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', invite_record.id,
    'token', invite_record.token,
    'invite_role', invite_record.invite_role,
    'epsu_id', invite_record.epsu_id,
    'is_active', invite_record.is_active,
    'use_count', invite_record.use_count,
    'max_uses', invite_record.max_uses
  );
end;
$$;
