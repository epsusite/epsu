delete from public.epsu_suggestions
where status = 'new'
  and country_code is null;
