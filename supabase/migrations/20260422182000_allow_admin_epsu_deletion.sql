create or replace function public.delete_hosted_epsu(p_epsu_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
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

  if not public.is_epsu_host(p_epsu_id) and not public.is_platform_admin() then
    raise exception 'Host access required';
  end if;

  insert into public.moderation_actions (actor_profile_id, epsu_id, action_type, details)
  values (
    auth.uid(),
    p_epsu_id,
    'delete_epsu',
    jsonb_build_object('slug', target_epsu.slug, 'name', target_epsu.name, 'scope', target_epsu.scope)
  );

  delete from public.epsus
  where id = p_epsu_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.delete_hosted_epsu(uuid) to authenticated;
