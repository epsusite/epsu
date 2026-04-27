alter table public.app_notifications
  add column if not exists push_ticket_ids jsonb,
  add column if not exists push_receipts_checked_at timestamptz;

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
    'generate_invite',
    'redeem_invite',
    'delete_epsu',
    'review_school_application'
  )
);

drop policy if exists "school_logos_authenticated_insert" on storage.objects;
create policy "school_logos_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'school-logos'
  and (storage.foldername(name))[1] = 'epsus'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "school_logos_authenticated_delete" on storage.objects;
drop policy if exists "school_logos_authenticated_delete_own_uploads" on storage.objects;
create policy "school_logos_authenticated_delete_own_uploads"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'school-logos'
  and (storage.foldername(name))[1] = 'epsus'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create or replace function public.redeem_epsu_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record public.epsu_invites%rowtype;
  next_role text;
  next_status text;
  next_use_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into invite_record
  from public.epsu_invites
  where token = nullif(trim(p_token), '')
  for update;

  if not found or not invite_record.is_active or invite_record.use_count >= invite_record.max_uses then
    return jsonb_build_object(
      'ok', false,
      'message', 'This invite is no longer valid'
    );
  end if;

  next_role := case when invite_record.invite_role = 'moderator' then 'moderator' else 'member' end;
  next_status := case when invite_record.invite_role = 'moderator' then 'active' else 'invited' end;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
  values (invite_record.epsu_id, auth.uid(), next_role, next_status, null)
  on conflict (epsu_id, profile_id)
  do update set
    role = excluded.role,
    status = excluded.status,
    muted_until = null
  where public.epsu_memberships.role <> 'owner';

  next_use_count := invite_record.use_count + 1;

  update public.epsu_invites
  set
    use_count = next_use_count,
    is_active = next_use_count < invite_record.max_uses
  where id = invite_record.id;

  insert into public.moderation_actions (actor_profile_id, target_profile_id, epsu_id, action_type, details)
  values (
    invite_record.created_by_profile_id,
    auth.uid(),
    invite_record.epsu_id,
    'redeem_invite',
    jsonb_build_object('invite_role', invite_record.invite_role, 'membership_status', next_status)
  );

  return jsonb_build_object(
    'ok', true,
    'epsuId', invite_record.epsu_id,
    'role', next_role,
    'status', next_status,
    'message', case
      when next_status = 'invited' then 'Join request sent, wait for host approval'
      else 'Moderator access granted'
    end
  );
end;
$$;

revoke all on function public.redeem_epsu_invite(text) from public;
grant execute on function public.redeem_epsu_invite(text) to authenticated;
