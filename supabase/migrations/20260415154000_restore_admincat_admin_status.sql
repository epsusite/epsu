update public.profiles
set is_admin = true
where lower(username) = 'admincat';
