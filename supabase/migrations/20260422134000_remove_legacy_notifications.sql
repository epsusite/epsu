create or replace function public.review_pending_school_epsu(p_epsu_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_epsu public.epsus%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  update public.epsus
  set review_status = p_status
  where id = p_epsu_id
    and scope = 'school'
    and review_status = 'pending'
  returning * into updated_epsu;

  if not found then
    raise exception 'Pending school Epsu not found';
  end if;

  if p_status = 'approved' and updated_epsu.host_id is not null then
    if public.count_school_epsu_memberships(updated_epsu.host_id, updated_epsu.id) >= 3 then
      raise exception 'Host already has three school Epsus';
    end if;

    insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
    values (updated_epsu.id, updated_epsu.host_id, 'host', 'active', null)
    on conflict (epsu_id, profile_id)
    do update set
      role = 'host',
      status = 'active',
      muted_until = null;
  end if;

  if p_status = 'rejected' and updated_epsu.logo_path is not null then
    perform public.delete_school_logo_object(updated_epsu.logo_path);

    update public.epsus
    set logo_path = null
    where id = updated_epsu.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', updated_epsu.id,
    'review_status', updated_epsu.review_status
  );
end;
$$;

create or replace function public.notify_flagged_post_to_moderators(p_post_id uuid, p_epsu_id uuid, p_keywords text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post public.posts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_post
  from public.posts
  where id = p_post_id
    and epsu_id = p_epsu_id;

  if not found then
    raise exception 'Post not found';
  end if;

  if target_post.author_id is distinct from auth.uid() then
    raise exception 'Only the post author can trigger this alert';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

delete from public.app_notifications
where kind in ('school_review', 'flagged_post');
