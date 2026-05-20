delete from public.moderation_actions
where action_type in ('generate_invite', 'delete_epsu', 'review_school_application');

alter table public.moderation_actions
drop constraint if exists moderation_actions_action_type_check;

alter table public.moderation_actions
add constraint moderation_actions_action_type_check
check (
  action_type in (
    'dismiss_report',
    'mute_author_24h',
    'remove_post',
    'change_member_role',
    'change_member_status',
    'kick_school_member',
    'redeem_invite'
  )
);

create or replace function public.ensure_epsu_invite(p_epsu_id uuid, p_invite_role text)
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

  delete from public.epsus
  where id = p_epsu_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.purge_expired_moderation_actions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.moderation_actions
  where (
    action_type in ('dismiss_report', 'mute_author_24h', 'remove_post')
    and created_at <= timezone('utc', now()) - interval '24 hours'
  ) or (
    action_type in ('change_member_role', 'change_member_status', 'kick_school_member', 'redeem_invite')
    and created_at <= timezone('utc', now()) - interval '48 hours'
  );

  get diagnostics deleted_count = row_count;

  return jsonb_build_object('ok', true, 'deletedCount', deleted_count);
end;
$$;

create extension if not exists pg_cron;

do $job$
begin
  if exists (
    select 1
    from pg_namespace
    where nspname = 'cron'
  ) then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'epsu-expired-moderation-actions-cleanup';

    perform cron.schedule(
      'epsu-expired-moderation-actions-cleanup',
      '*/10 * * * *',
      $sql$select public.purge_expired_moderation_actions();$sql$
    );
  end if;
end;
$job$;
