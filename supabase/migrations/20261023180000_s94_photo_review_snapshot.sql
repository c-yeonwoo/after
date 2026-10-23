-- A pending member may replace photos while an operator is reviewing them.
-- Lock and compare the visible set before using the existing audited operations.
drop function if exists public.admin_review_photo_set(uuid,text[],public.photo_state,boolean,text);
create or replace function public.admin_review_photo_set(
  p_user uuid,
  p_expected_paths text[],
  p_expected_state public.photo_state,
  p_approve boolean,
  p_note text,
  p_expected_updated_at timestamptz default null
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
  if v_profile.photo_state is distinct from p_expected_state or v_paths is distinct from p_expected_paths
     or (p_expected_updated_at is not null and v_profile.updated_at is distinct from p_expected_updated_at) then
    raise exception 'photo changed' using errcode = 'PT409';
  end if;
  if p_expected_state = 'pending' then
    perform public.admin_review_photo(p_user, p_approve, p_note);
  else
    perform public.admin_reset_photo(p_user, p_note);
  end if;
end $$;

revoke all on function public.admin_review_photo_set(uuid,text[],public.photo_state,boolean,text,timestamptz) from public, anon;
grant execute on function public.admin_review_photo_set(uuid,text[],public.photo_state,boolean,text,timestamptz) to authenticated;

-- A file can change without its path changing (overwrite, delete/reinsert, move).
-- Metadata/access-time updates alone do not invalidate a review.
create function public.invalidate_stored_photo_review() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old text;
  v_new text;
begin
  if tg_op = 'UPDATE' then
    if new.version is not distinct from old.version and new.name = old.name
       and new.bucket_id = old.bucket_id then return new; end if;
  end if;
  if tg_op <> 'INSERT' and old.bucket_id = 'profile-photos' then v_old := old.name; end if;
  if tg_op <> 'DELETE' and new.bucket_id = 'profile-photos' then v_new := new.name; end if;
  update public.profiles set photo_state = 'pending', photo_reviewed_at = null,
    photo_reviewed_by = null, photo_reject_reason = null,
    updated_at = clock_timestamp()
  where photo_url in (v_old, v_new) or v_old = any(photo_paths) or v_new = any(photo_paths);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.invalidate_stored_photo_review() from public, anon, authenticated;
create trigger invalidate_stored_photo_review
after insert or update or delete on storage.objects
for each row execute function public.invalidate_stored_photo_review();
