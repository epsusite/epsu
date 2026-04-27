delete from public.epsus;

select count(*)::int as user_count
from public.profiles;
