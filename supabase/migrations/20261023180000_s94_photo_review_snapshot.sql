-- A pending member may replace photos while an operator is reviewing them.
-- Lock and compare the visible set before using the existing audited operations.
create function public.admin_review_photo_set(
  p_user uuid,
  p_expected_paths text[],
  p_expected_state public.photo_state,
  p_approve boolean,
  p_note text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_profile public.profiles;
  v_paths text[];
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_expected_state is null or p_approve is null
     or not (p_expected_state = 'pending' or (p_expected_state = 'approved' and not p_approve))
     or coalesce(cardinality(p_expected_paths), 0) = 0 then
    raise exception 'invalid photo review' using errcode = '22023';
  end if;
  select * into v_profile from public.profiles where id = p_user for update;
  if not found then
    raise exception 'photo changed' using errcode = 'PT409';
  end if;
  v_paths := case when cardinality(v_profile.photo_paths) > 0 then v_profile.photo_paths
    when v_profile.photo_url is not null then array[v_profile.photo_url] else array[]::text[] end;
  if v_profile.photo_state is distinct from p_expected_state or v_paths is distinct from p_expected_paths then
    raise exception 'photo changed' using errcode = 'PT409';
  end if;
  if p_expected_state = 'pending' then
    perform public.admin_review_photo(p_user, p_approve, p_note);
  else
    perform public.admin_reset_photo(p_user, p_note);
  end if;
end $$;

revoke all on function public.admin_review_photo_set(uuid,text[],public.photo_state,boolean,text) from public, anon;
grant execute on function public.admin_review_photo_set(uuid,text[],public.photo_state,boolean,text) to authenticated;
