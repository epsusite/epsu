create or replace function public.apply_to_school_epsu(p_epsu_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_epsu public.epsus%rowtype;
  membership_record public.epsu_memberships%rowtype;
  application_record public.epsu_join_applications%rowtype;
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

  if target_epsu.scope <> 'school' then
    raise exception 'Only school Epsus accept applications';
  end if;

  if char_length(trim(coalesce(p_answer, ''))) < 10 or char_length(trim(coalesce(p_answer, ''))) > 1000 then
    raise exception 'Application answer must be between 10 and 1000 characters';
  end if;

  select *
  into membership_record
  from public.epsu_memberships
  where epsu_id = p_epsu_id
    and profile_id = auth.uid();

  if found then
    if membership_record.status = 'kicked' then
      raise exception 'You were removed from this Epsu';
    end if;

    if membership_record.status in ('active', 'muted') then
      raise exception 'You are already in this Epsu';
    end if;
  end if;

  if exists (
    select 1
    from public.epsu_join_applications
    where epsu_id = p_epsu_id
      and profile_id = auth.uid()
  ) then
    raise exception 'You already applied to this Epsu';
  end if;

  insert into public.epsu_join_applications (epsu_id, profile_id, answer, status, reviewed_by_profile_id, reviewed_at)
  values (p_epsu_id, auth.uid(), trim(p_answer), 'pending', null, null)
  returning * into application_record;

  return jsonb_build_object(
    'ok', true,
    'applicationId', application_record.id,
    'status', application_record.status
  );
end;
$$;

grant execute on function public.apply_to_school_epsu(uuid, text) to authenticated;
