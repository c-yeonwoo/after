-- S14 — 가격 조정 · 잠시 쉬기 · 탈퇴
--
-- 스키마가 이미 예비해 둔 값을 쓴다: account_state 에 'withdrawn',
-- intro_outcome 에 'withdrawn' 이 S1 부터 있었다.

-- ─────────────── 3장 가격 조정 ───────────────
-- 이미 배포된 마이그레이션은 고치지 않는다 — 적용된 환경이 있을 수 있다.
create or replace function ticket_bundle_amount(p_quantity smallint)
  returns integer language sql immutable as $$
  select case p_quantity
           when 1 then 30000
           when 3 then 85000   -- 장당 28,333원 (6% 할인)
         end
$$;

/*
  CHECK 는 이 함수를 참조하므로 새 주문부터 85,000원만 통과한다.
  이미 만들어진 80,000원 주문은 그대로 남는다 — CHECK 는 기존 행을 재검사하지
  않고, 재검사시켜서도 안 된다(그 금액으로 결제가 이미 진행됐을 수 있다).
*/

-- ─────────────── 잠시 쉬기 ───────────────
--
-- 알림을 전면 끄고 싶은 사람에게 실제로 필요한 것(S13 에서 미룬 것).
-- 의미를 좁게 정의한다: **새 소개만 멈춘다.**
--   · 진행 중인 요청·약속은 그대로다. 상대가 이미 티켓을 썼다면 그 사람의 돈이
--     걸려 있으므로, 내가 쉬겠다고 그 약속을 깨는 건 상대에게 부당하다.
--   · 열려 있는 소개도 닫지 않는다. 닫으면 pass 와 구분이 안 되고,
--     pass 는 영구 배제라 되돌릴 수 없다.

alter table profiles
  add column paused_at timestamptz;

comment on column profiles.paused_at is
  '잠시 쉬기. 새 소개·평가 대상에서 빠진다. 진행 중인 요청·약속에는 영향을 주지 않는다.';

/*
  자격의 단일 지점. S6 주석이 경고한 사고(같은 조건이 뷰와 정책 두 곳에 따로
  적혀 갈라짐)를 반복하지 않으려면, 조건을 여기 넣고 이 뷰를 쓰는 쪽이
  자동으로 따라오게 해야 한다 — open_intro() 가 이 뷰를 조인한다.

  security_invoker = true 를 반드시 유지한다(빼면 호출자의 RLS 를 우회한다).
*/
drop view if exists eligible_profiles;

create view eligible_profiles with (security_invoker = true) as
  select * from profiles
   where email_verified_at is not null
     and account_state = 'active'
     and onboarding_step = 7
     and terms_agreed_at is not null
     and privacy_agreed_at is not null
     and paused_at is null;

-- 뷰를 쓰지 않는 경로들도 함께 고친다. 빠뜨리면 쉬는 중인 사람이 계속 노출된다.

create or replace function is_eligible_candidate(p_id uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from profiles t
     where t.id                = p_id
       and t.gender            = 'male'
       and t.email_verified_at is not null
       and t.account_state     = 'active'
       and t.onboarding_step   = 7
       and t.terms_agreed_at   is not null
       and t.privacy_agreed_at is not null
       and t.paused_at         is null
       and t.hub_id            = my_hub_id()
  )
$$;

create or replace function next_candidate()
  returns setof public_profiles
  language sql stable security definer set search_path = public, pg_temp as $$
  select pp.*
    from public_profiles pp
    join profiles p on p.id = pp.id
   where my_gender() = 'female'
     and p.gender            = 'male'
     and p.hub_id            = my_hub_id()
     and p.email_verified_at is not null
     and p.account_state     = 'active'
     and p.onboarding_step   = 7
     and p.terms_agreed_at   is not null
     and p.privacy_agreed_at is not null
     and p.paused_at         is null
     and not exists (
       select 1 from affinities a
        where a.from_id = auth.uid() and a.to_id = p.id
     )
     and not is_excluded(auth.uid(), p.id)
   order by p.created_at
   limit 1
$$;

create or replace function remaining_candidates()
  returns integer
  language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int
    from profiles p
   where my_gender() = 'female'
     and p.gender            = 'male'
     and p.hub_id            = my_hub_id()
     and p.email_verified_at is not null
     and p.account_state     = 'active'
     and p.onboarding_step   = 7
     and p.terms_agreed_at   is not null
     and p.privacy_agreed_at is not null
     and p.paused_at         is null
     and not exists (
       select 1 from affinities a
        where a.from_id = auth.uid() and a.to_id = p.id
     )
     and not is_excluded(auth.uid(), p.id)
$$;

-- paused_at 은 서버 전용 컬럼이 아니라 본인이 켜고 끄는 값이지만,
-- 컬럼 GRANT 를 주면 "남의 행"을 못 막는 게 아니라 "언제 켜졌는지"를 위조할 수
-- 있다(과거 시각으로 넣기). 시각은 서버가 찍는다.
create or replace function set_paused(p_on boolean) returns profiles
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me profiles;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  update profiles
     set paused_at = case when p_on then coalesce(paused_at, now()) else null end
   where id = auth.uid()
  returning * into v_me;

  insert into events (user_id, name, props)
  values (auth.uid(), case when p_on then 'paused' else 'resumed' end, '{}'::jsonb);

  return v_me;
end $$;

revoke all on function set_paused(boolean) from public, anon;
grant execute on function set_paused(boolean) to authenticated;

-- ─────────────── 탈퇴 ───────────────
--
-- 나가는 사람 때문에 남는 사람이 손해를 보면 안 된다. 순서가 중요하다:
--   1) 아직 만나지 않은 약속을 취소하고 상대의 티켓을 환불한다.
--   2) 열려 있는 소개를 'withdrawn' 으로 닫는다 — 'passed' 로 닫으면
--      intro_exclusions 에 영구 배제가 기록되어, 남는 사람이 "거절당했다"는
--      기록을 갖게 된다. 탈퇴는 거절이 아니다.
--   3) 프로필의 신원 정보를 지운다.
--   4) 계정을 withdrawn 으로 표시한다.
--
-- 거래 기록(tickets · ticket_orders · meetings · events)은 남긴다 —
-- 전자상거래법상 보존 의무가 있고, 환불 근거가 사라지면 분쟁을 다룰 수 없다.
-- 지우는 것은 **누구인지 알 수 있는 값**이다.

create or replace function withdraw_account(p_reason text default null) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  r     record;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  -- 1) 아직 완료되지 않은 약속 정리 + 상대 티켓 환불
  for r in
    select m.id as meeting_id, m.ticket_id, m.intro_id
      from meetings m join intros i on i.id = m.intro_id
     where v_uid in (i.male_id, i.female_id)
       and m.cancelled_at is null
       and m.completed_at is null
  loop
    update meetings
       set cancelled_at = now(), cancel_reason = 'counterpart_withdrawn'
     where id = r.meeting_id;
    -- 이미 환불된 티켓이면 refund_ticket 이 예외를 던지므로 상태를 먼저 본다.
    if exists (select 1 from tickets where id = r.ticket_id and state = 'used') then
      perform refund_ticket(r.ticket_id, 'counterpart_withdrawn');
    end if;
  end loop;

  -- 2) 열려 있는 소개를 닫는다. 'passed' 가 아니라 'withdrawn' 이다.
  update intros
     set closed_at = now(), outcome = 'withdrawn'
   where v_uid in (male_id, female_id)
     and closed_at is null;

  -- 3) 신원 정보 삭제. company_email 은 not null 이라 비울 수 없어 익명화한다 —
  --    이 값이 남으면 어느 회사의 누구였는지 특정된다.
  update profiles
     set name          = null,
         birth         = null,
         job           = null,
         photo_url     = null,
         mbti          = null,
         smoking       = null,
         drinking      = null,
         religion      = null,
         headline      = null,
         intro         = null,
         details       = '{}'::jsonb,   -- not null 컬럼이라 비우지 못한다
         match_note    = null,
         topic_note    = null,
         interests     = '{}',
         match_tags    = '{}',
         topics        = '{}',
         company_email = 'withdrawn+' || v_uid::text || '@invalid',
         account_state = 'withdrawn',
         banned_reason = p_reason
   where id = v_uid;

  -- 보내지 못한 알림은 지운다 — 없는 사람에게 메일을 보낼 이유가 없다.
  delete from notifications where user_id = v_uid and sent_at is null;

  insert into events (user_id, name, props)
  values (v_uid, 'account_withdrawn', jsonb_build_object('reason', p_reason));
end $$;

revoke all on function withdraw_account(text) from public, anon;
grant execute on function withdraw_account(text) to authenticated;

comment on function withdraw_account is
  '탈퇴. 진행 중 약속을 취소하고 상대 티켓을 환불한 뒤 신원 정보를 지운다. 거래 기록은 남긴다.';

-- ─────────────── 상품 목록을 서버가 알려준다 ───────────────
--
-- store.tsx 가 가격을 하드코딩하고 있었다. 방금 3장 가격을 바꾸면서 확인했듯
-- 서버와 어긋나면 사용자는 80,000원을 보고 주문이 거부되는 경험을 한다.
-- 표시값도 ticket_bundle_amount() 에서 나오게 해서 드리프트를 없앤다.

create or replace function ticket_bundles()
  returns table (quantity smallint, amount integer)
  language sql stable as $$
  select q, ticket_bundle_amount(q)
    from (values (1::smallint), (3::smallint)) as t(q)
$$;

revoke all on function ticket_bundles() from public, anon;
grant execute on function ticket_bundles() to authenticated;
