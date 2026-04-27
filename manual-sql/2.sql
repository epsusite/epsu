create or replace function public.ensure_regional_memberships(p_country_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_country_code text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_country_code := upper(trim(coalesce(p_country_code, '')));

  if char_length(normalized_country_code) <> 2 then
    return jsonb_build_object('ok', false);
  end if;

  insert into public.epsu_memberships (epsu_id, profile_id, role, status)
  select epsu.id, auth.uid(), 'member', 'active'
  from public.epsus epsu
  where epsu.scope in ('country', 'state', 'city')
    and epsu.country_code = normalized_country_code
    and not exists (
      select 1
      from public.epsu_memberships membership
      where membership.epsu_id = epsu.id
        and membership.profile_id = auth.uid()
        and membership.status = 'kicked'
    )
  on conflict (epsu_id, profile_id)
  do update set
    status = case
      when public.epsu_memberships.status = 'kicked' then public.epsu_memberships.status
      else 'active'
    end,
    muted_until = case
      when public.epsu_memberships.status = 'kicked' then public.epsu_memberships.muted_until
      else null
    end;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.ensure_regional_memberships(text) to authenticated;
