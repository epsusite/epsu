create or replace function public.register_push_token(p_expo_push_token text, p_platform text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_token text;
  normalized_platform text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_token := nullif(trim(p_expo_push_token), '');
  normalized_platform := lower(nullif(trim(p_platform), ''));

  if normalized_token is null then
    raise exception 'Push token required';
  end if;

  if normalized_platform not in ('ios', 'android', 'web') then
    normalized_platform := 'unknown';
  end if;

  update public.profile_push_tokens
  set
    enabled = false,
    last_seen_at = timezone('utc', now())
  where profile_id = auth.uid()
    and platform = normalized_platform
    and expo_push_token <> normalized_token;

  insert into public.profile_push_tokens (
    profile_id,
    expo_push_token,
    platform,
    enabled,
    last_seen_at
  )
  values (
    auth.uid(),
    normalized_token,
    normalized_platform,
    true,
    timezone('utc', now())
  )
  on conflict (profile_id, expo_push_token)
  do update set
    platform = excluded.platform,
    enabled = true,
    last_seen_at = timezone('utc', now());

  return jsonb_build_object('ok', true);
end;
$$;
