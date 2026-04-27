create or replace function public.delete_own_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if exists (
    select 1
    from public.epsus epsu
    where epsu.owner_id = current_user_id
  ) then
    raise exception 'Delete or transfer your managed Epsus before deleting this account.';
  end if;

  delete from public.app_notifications
  where profile_id = current_user_id;

  delete from public.post_reactions
  where profile_id = current_user_id;

  delete from public.post_reports
  where profile_id = current_user_id;

  delete from public.epsu_subscriptions
  where profile_id = current_user_id;

  delete from public.epsu_join_applications
  where profile_id = current_user_id;

  delete from public.epsu_memberships
  where profile_id = current_user_id;

  delete from public.epsu_suggestions
  where profile_id = current_user_id;

  delete from auth.users
  where id = current_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.delete_own_account() to authenticated;
