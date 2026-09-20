-- S35 — 회원 정지/해제 감사 로그 컬럼명 수정.
--
-- s28b 에서 함수를 재정의하며 admin_actions.actor_id 를 존재하지 않는
-- admin_id 로 잘못 적었다. UPDATE 뒤 감사 로그 INSERT 에서 전체 호출이
-- 롤백되므로 운영자 화면에서 회원을 정지하거나 해제할 수 없었다.

create or replace function admin_set_account_state(
  p_user  uuid,
  p_state account_state,
  p_note  text
) returns profiles
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_profile profiles;
  r         record;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'note required' using errcode = '22023';
  end if;
  if p_state not in ('active', 'banned') then
    raise exception 'only active/banned can be set here' using errcode = '22023';
  end if;
  if exists (select 1 from profiles where id = p_user and role = 'admin') then
    raise exception 'cannot change an admin account state' using errcode = '42501';
  end if;
  if exists (select 1 from profiles where id = p_user and account_state = 'withdrawn') then
    raise exception 'withdrawn account cannot be restored' using errcode = '42501';
  end if;

  update profiles
     set account_state = p_state,
         banned_reason = case when p_state = 'banned' then p_note else null end
   where id = p_user
  returning * into v_profile;
  if not found then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  if p_state = 'banned' then
    for r in
      select m.id as meeting_id, m.ticket_id, m.intro_id, t.user_id as ticket_owner
        from meetings m
        join intros i on i.id = m.intro_id
        join tickets t on t.id = m.ticket_id
       where m.cancelled_at is null and m.completed_at is null
         and p_user in (i.male_id, i.female_id)
    loop
      update meetings
         set cancelled_at = now(), cancel_reason = 'counterpart_banned'
       where id = r.meeting_id;
      update intros set closed_at = now(), outcome = 'withdrawn'
       where id = r.intro_id and closed_at is null;
      if r.ticket_owner <> p_user
         and exists (select 1 from tickets where id = r.ticket_id and state = 'used') then
        perform refund_ticket(r.ticket_id, 'counterpart_banned');
      end if;
    end loop;
  end if;

  insert into admin_actions (actor_id, kind, target_user, target_ref, note)
  values (v_uid, case when p_state = 'banned' then 'ban' else 'unban' end,
          p_user, p_user, p_note);

  return v_profile;
end $$;

comment on function admin_set_account_state(uuid, account_state, text) is
  '회원 정지·해제. 탈퇴 계정은 되돌리지 않는다. 정지 시 진행 중 만남을 끊고, 티켓 주인이 위반자가 아니면 환불한다.';

