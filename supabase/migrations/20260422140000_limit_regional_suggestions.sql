create or replace function public.enforce_regional_suggestion_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if new.profile_id is distinct from auth.uid() then
    raise exception 'You can only create suggestions for yourself';
  end if;

  if public.count_regional_epsu_memberships(auth.uid()) >= 1 then
    raise exception 'You can only be in one regional Epsu at a time';
  end if;

  return new;
end;
$$;

drop trigger if exists epsu_suggestions_regional_limit on public.epsu_suggestions;
create trigger epsu_suggestions_regional_limit
before insert on public.epsu_suggestions
for each row
execute function public.enforce_regional_suggestion_limit();
