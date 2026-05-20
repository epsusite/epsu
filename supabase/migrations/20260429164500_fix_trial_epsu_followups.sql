create or replace function public.request_epsu_logo_cleanup(p_logo_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cleanup_secret text;
  normalized_logo_path text;
begin
  normalized_logo_path := nullif(trim(coalesce(p_logo_path, '')), '');

  if normalized_logo_path is null then
    return;
  end if;

  select secret.value
  into cleanup_secret
  from public.app_runtime_secrets secret
  where secret.key = 'epsu_logo_cleanup_secret';

  if cleanup_secret is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://xzgzzuxmtjrppavvynuy.supabase.co/functions/v1/cleanup-epsu-logos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-epsu-logo-cleanup-secret', cleanup_secret
    ),
    body := jsonb_build_object('logoPath', normalized_logo_path)
  );
end;
$$;

create or replace function public.process_trial_epsus()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  converted_count integer := 0;
  deleted_count integer := 0;
  target_record record;
begin
  for target_record in
    select epsu.id
    from public.epsus epsu
    where epsu.review_status = 'approved'
      and epsu.is_trial = true
  loop
    if public.convert_trial_epsu_if_ready(target_record.id) then
      converted_count := converted_count + 1;
    end if;
  end loop;

  for target_record in
    select epsu.id, epsu.logo_path
    from public.epsus epsu
    where epsu.review_status = 'approved'
      and epsu.is_trial = true
      and epsu.trial_ends_at is not null
      and epsu.trial_ends_at <= timezone('utc', now())
  loop
    delete from public.app_notifications
    where related_epsu_id = target_record.id;

    perform public.request_epsu_logo_cleanup(target_record.logo_path);

    update public.epsu_trial_submissions
    set status = 'expired'
    where epsu_id = target_record.id
      and status = 'approved';

    delete from public.epsus
    where id = target_record.id
      and is_trial = true;

    if found then
      deleted_count := deleted_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'convertedCount', converted_count,
    'deletedCount', deleted_count
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

  delete from public.app_notifications
  where related_epsu_id = p_epsu_id;

  perform public.request_epsu_logo_cleanup(target_epsu.logo_path);

  if target_epsu.is_trial then
    update public.epsu_trial_submissions
    set status = 'expired'
    where epsu_id = p_epsu_id
      and status = 'approved';
  end if;

  delete from public.epsus
  where id = p_epsu_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.fetch_guest_epsus(text) to anon;
grant execute on function public.fetch_guest_epsus(text) to authenticated;
