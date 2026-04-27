create or replace function public.delete_school_logo_object(p_logo_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Supabase Storage no longer allows direct deletes from storage.objects.
  -- Keep this helper as a no-op so legacy RPCs that still call it continue to work.
  return;
end;
$$;

grant execute on function public.delete_school_logo_object(text) to authenticated;
