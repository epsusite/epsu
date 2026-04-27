alter table public.post_reports
add column if not exists reason text;

create index if not exists post_reports_post_id_reason_idx
on public.post_reports (post_id, reason)
where status = 'open';
