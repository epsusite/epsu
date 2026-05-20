drop function if exists public.apply_to_school_epsu(uuid, text);
drop function if exists public.review_school_application(uuid, text);

drop table if exists public.epsu_join_applications cascade;
drop table if exists public.account_requests cascade;
