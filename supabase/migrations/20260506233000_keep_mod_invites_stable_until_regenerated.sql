create or replace function public.ensure_epsu_invite(
  p_epsu_id uuid,
  p_invite_role text,
  p_force_new boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record public.epsu_invites%rowtype;
  invite_token text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_epsu_host(p_epsu_id) and not public.is_platform_admin() then
    raise exception 'Only hosts or admins can generate invites';
  end if;

  if p_invite_role not in ('member', 'moderator') then
    raise exception 'Invalid invite role';
  end if;

  if not coalesce(p_force_new, false) then
    select *
    into invite_record
    from public.epsu_invites
    where epsu_id = p_epsu_id
      and created_by_profile_id = auth.uid()
      and invite_role = p_invite_role
      and is_active = true
      and use_count < max_uses
    order by created_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'id', invite_record.id,
        'token', invite_record.token,
        'invite_role', invite_record.invite_role,
        'epsu_id', invite_record.epsu_id,
        'is_active', invite_record.is_active,
        'use_count', invite_record.use_count,
        'max_uses', invite_record.max_uses
      );
    end if;
  end if;

  update public.epsu_invites
  set is_active = false
  where epsu_id = p_epsu_id
    and created_by_profile_id = auth.uid()
    and invite_role = p_invite_role
    and is_active = true;

  invite_token := encode(extensions.gen_random_bytes(24), 'base64');
  invite_token := replace(replace(replace(invite_token, '/', ''), '+', ''), '=', '');

  insert into public.epsu_invites (epsu_id, created_by_profile_id, invite_role, token, max_uses)
  values (p_epsu_id, auth.uid(), p_invite_role, invite_token, 1)
  returning * into invite_record;

  return jsonb_build_object(
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
