-- S33 — 이미 승인한 사진을 운영자가 다시 내릴 수 있게 한다.
--
-- 승인 이후에 부적절함을 발견하면 기존 admin_review_photo()는 pending 상태만
-- 처리해서 손을 댈 수 없었다. 계정을 정지시키는 것은 과하고, 그대로 노출하는
-- 것은 안전 문제다. 반려로 되돌리면 즉시 후보 풀에서 빠지고 회원은 사유를 본다.

alter table admin_actions drop constraint if exists admin_actions_kind_check;
alter table admin_actions add constraint admin_actions_kind_check check (
  kind in ('resolve_report', 'ban', 'unban', 'refund', 'cancel_meeting',
           'review_photo', 'set_queue', 'resolve_no_show', 'set_payments',
           'fulfill_order', 'reset_photo')
);

create function admin_reset_photo(p_user uuid, p_note text)
  returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'note required' using errcode = '22023';
  end if;

  update profiles
     set photo_state         = 'rejected',
         photo_reviewed_at   = now(),
         photo_reviewed_by   = v_uid,
         photo_reject_reason = p_note
   where id = p_user
     and photo_url is not null
     and photo_state = 'approved';
  if not found then
    -- 이미 다른 운영자가 처리했거나 사진을 바꿨다. 정상적인 경합이다.
    raise exception 'photo not approved' using errcode = 'PT409';
  end if;

  insert into admin_actions (actor_id, kind, target_user, target_ref, note)
  values (v_uid, 'reset_photo', p_user, null, p_note);
end $$;

comment on function admin_reset_photo(uuid, text) is
  '이미 승인한 사진을 반려로 되돌린다. 후보 노출을 즉시 멈추고 사유를 회원에게 보여 준다.';

revoke all on function admin_reset_photo(uuid, text) from public, anon;
grant execute on function admin_reset_photo(uuid, text) to authenticated;
