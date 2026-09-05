-- S28b — 배제를 세 지점에서 재확인하고, 티켓 발급을 다시 잠근다
--
-- 진단에서 나온 P0 세 건 중 둘을 한 커밋에 묶는다. 둘 다 "나중에 추가된 것이
-- 초기 규칙을 상속하지 못한 자리" 라는 같은 성격이라, 따로 고치면 다음에 또
-- 같은 자리가 샌다.
--
-- ── ① 티켓 발급이 비로그인에게 열려 있었다 ──
--
-- s19 가 issue_ticket 에 인자를 하나 붙이면서 **새 함수**를 만들었는데
-- (`create or replace` 가 아니다 — 시그니처가 다르면 다른 함수다),
-- `grant execute ... to service_role` 만 하고 `revoke ... from public` 을
-- 하지 않았다. PostgreSQL 은 함수 EXECUTE 를 **PUBLIC 에 기본 부여**한다.
-- 그 결과 ACL 이 `{=X/postgres, ...}` — 앱 번들에 박힌 anon 키만으로
-- `POST /rest/v1/rpc/issue_ticket` 을 불러 임의의 사람에게 0원짜리 티켓을
-- 무제한 발급할 수 있었다(로컬에서 anon 롤로 재현 확인).
--
-- 이 함정은 이미 코드에 문서화돼 있었다 — s4 주석이 "s1 의 revoke 는 이후
-- 마이그레이션에 적용되지 않는다" 고 경고한다. s4 는 지켰고 s19 가 잊었다.
-- 사람이 기억하는 것으로는 세 번째에도 또 잊는다. 그래서 아래 revoke 와 함께
-- **pgTAP 회귀 검사**(supabase/tests/anon_surface.sql)를 넣는다.
--
-- ── ② 배제(차단·패스)가 한 지점에서만 확인됐다 ──
--
-- `intro_exclusions` 는 "이 둘은 영영 소개되지 않는다" 를 대칭·영구로 기록한다.
-- 그런데 그 기록을 실제로 확인하는 곳이 후보 조회(next_candidate)뿐이었다.
-- 큐(intro_queue)에 이미 들어간 카드, 소개 개시(open_intro), 프로필 열람
-- (public_profiles)은 아무도 다시 보지 않았다. 사고 서사가 완성된다 —
-- **"차단했는데 또 나왔고, 그걸 여느라 환불되지 않는 소개 티켓이 사라졌다."**
--
-- 고치는 원칙: 배제는 **기록하는 곳에서 청소까지** 한다(exclude_pair). 그리고
-- 읽는 곳마다 한 번 더 본다. 한쪽만 하면 과거 데이터가 남고, 다른 쪽만 하면
-- 매번 조인 비용을 낸다.

-- ═══════════════════ ① 발급 권한 ═══════════════════

revoke all on function issue_ticket(uuid, text, integer, ticket_kind)
  from public, anon, authenticated;
grant execute on function issue_ticket(uuid, text, integer, ticket_kind) to service_role;

/*
  트리거 함수도 함께 잠근다. 트리거 컨텍스트 밖에서 부르면 어차피 거절되므로
  실질 위험은 없지만, "anon 이 실행 가능한 public 함수 목록" 을 회귀 검사로
  고정하려면 예외 목록이 없는 편이 낫다 — 예외가 있으면 다음에 진짜 구멍이
  생겼을 때 그 줄에 섞여 안 보인다.
*/
revoke all on function log_affinity_submitted() from public, anon, authenticated;
revoke all on function meetings_notify()        from public, anon, authenticated;
revoke all on function reset_photo_review()     from public, anon, authenticated;
revoke all on function sync_email_verified()    from public, anon, authenticated;

-- ═══════════════════ ② 배제 ═══════════════════

-- ─────────── 기록하는 곳이 청소까지 한다 ───────────

/*
  exclude_pair 는 지금까지 행 하나를 넣기만 했다. 넣는 순간 "이 둘은 영영
  소개되지 않는다" 가 참이 되어야 하는데, 이미 줄 서 있는 큐 카드는 그대로
  남아 며칠 뒤 소개로 열렸다.

  아직 **열리지 않은** 카드만 지운다. 열린 카드(opened_at)는 지우지 않는다 —
  그건 예정이 아니라 기록이고, 큐레이터 지표(s22)가 그 행을 센다.

  sql 함수에서 plpgsql 로 바꾼다. 조건부 후속 작업(promote)이 필요해졌다.
*/
create or replace function exclude_pair(a uuid, b uuid, p_reason text) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  insert into intro_exclusions (user_lo, user_hi, reason)
  values (least(a, b), greatest(a, b), p_reason)
  on conflict (user_lo, user_hi) do nothing;

  -- 방향을 모른다(누가 남성인지 인자로 안 받는다). 두 방향 모두 지운다.
  for r in
    delete from intro_queue
     where opened_at is null
       and ((male_id = a and female_id = b) or (male_id = b and female_id = a))
    returning male_id
  loop
    -- 빈 자리에 뒷줄을 올린다. 안 그러면 지운 만큼 큐가 짧아진 채로 남는다.
    perform promote_intro_queue(r.male_id);
  end loop;
end $$;

comment on function exclude_pair(uuid, uuid, text) is
  '영구 배제 기록 + 아직 열리지 않은 큐 카드 청소. 기록과 청소가 갈라지면 배제가 무의미해진다.';

-- ─────────── 차단이 소개까지 닫는다 ───────────

/*
  block_user 는 만남만 끊고(sever_active_meeting) **소개는 열어 둔 채였다.**
  결과가 둘이다.
    · 차단한 상대의 카드가 홈에 계속 남는다(홈은 열린 소개를 그린다).
    · 불변식 2(동시 1건)에 자리를 차지해 **다음 소개를 못 받는다** — 차단한
      쪽이 벌을 받는 구조였다.
  닫되 outcome 은 'passed' 가 아니라 'blocked' 다. 지표에서 "안 맞아서 넘김" 과
  "위험해서 끊음" 은 전혀 다른 신호이고, 후자는 세어야 할 값이다.
*/
create or replace function block_user(p_target uuid, p_reason text default null)
  returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if p_target = v_uid then
    raise exception 'cannot block yourself' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = p_target) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  -- 영영 소개되지 않는다. 대칭이고 되돌릴 수 없다. (큐 청소는 이 안에서)
  perform exclude_pair(v_uid, p_target, coalesce(p_reason, 'blocked'));
  perform sever_active_meeting(v_uid, p_target, 'blocked');

  update intros
     set closed_at = now(), outcome = 'blocked'
   where closed_at is null
     and ((male_id = v_uid and female_id = p_target)
       or (male_id = p_target and female_id = v_uid));

  insert into events (user_id, name, props)
  values (v_uid, 'user_blocked', jsonb_build_object('target', p_target));
end $$;

comment on function block_user(uuid, text) is
  '스스로 차단. 소개와 만남을 함께 끊고 영구 배제한다. 티켓은 환불하지 않는다 — 끊는 비용은 끊는 쪽이 진다.';

-- ─────────── 개시 직전에 다시 본다 ───────────

/*
  exclude_pair 가 청소하므로 원칙적으로 배제된 카드는 큐에 없다. 그래도 개시
  직전에 한 번 더 본다 — **여기가 돈이 나가는 지점**이고(소개 티켓은 환불되지
  않는다), 청소가 도달하지 못한 경로가 하나라도 생기면 그 비용을 사용자가 낸다.
  조건 한 줄이 그 위험을 통째로 없앤다.

  s22 판(큐레이터 승계)을 그대로 두고 where 절만 늘린다.
*/
create or replace function open_intro() returns intros
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_intro  intros;
  v_card   intro_queue;
  v_ticket tickets;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if my_gender() <> 'male' then
    raise exception 'only male users receive introductions' using errcode = '42501';
  end if;

  -- 불변식 2: 이미 오픈된 소개가 있으면 그것을 반환한다(티켓 차감 없음).
  select * into v_intro from intros
   where male_id = v_uid and closed_at is null;
  if found then
    return v_intro;
  end if;

  select * into v_card from intro_queue
   where male_id = v_uid
     and opened_at is null
     and delivered_at is not null
     and expires_at > now()
     and not is_excluded(v_uid, female_id)
   order by position, created_at
   limit 1
   for update skip locked;
  if not found then
    raise exception 'no eligible candidate' using errcode = 'P0002';
  end if;

  select * into v_ticket from tickets
   where user_id = v_uid and state = 'unused' and kind = 'intro'
   order by issued_at
   limit 1
   for update skip locked;
  if not found then
    raise exception 'no unused intro ticket' using errcode = 'P0003';
  end if;

  /*
    소개를 먼저 만든 뒤 티켓을 거기에 붙인다. tickets_check2 가
    `state = 'used' → intro_id is not null` 을 요구한다(s1).
  */
  insert into intros (male_id, female_id, curated_by)
  values (v_uid, v_card.female_id, v_card.curated_by)
  returning * into v_intro;

  update tickets
     set state = 'used', used_at = now(), intro_id = v_intro.id
   where id = v_ticket.id;

  update intro_queue set opened_at = now() where id = v_card.id;
  perform promote_intro_queue(v_uid);

  insert into events (user_id, name, props)
  values (v_uid, 'intro_opened',
          jsonb_build_object('intro_id', v_intro.id, 'ticket_id', v_ticket.id,
                             'curated_by', v_card.curated_by));

  return v_intro;
end $$;

comment on function open_intro() is
  '큐의 맨 앞 카드를 열고 소개 티켓 1장을 차감한다. 배제된 상대는 건너뛴다. 티켓이 없으면 P0003.';

-- ─────────── 열람에서도 본다 ───────────

/*
  public_profiles 의 여성 분기(같은 권역 남성 평가)에 배제 확인이 없었다.
  s1 의 구 정책(profiles_select_counterpart)에는 있었는데 s8 이 뷰로 옮기면서
  유실된 조건이다 — 리팩터링에서 조건 하나가 사라지는, 눈으로는 못 잡는 종류.

  이번에는 분기마다 붙이지 않고 **본인 외 전체에 한 번** 건다. 분기가 늘 때마다
  같은 실수를 반복하지 않으려면 조건이 분기 밖에 있어야 한다.

  결과적으로 차단한 상대는 끝난 만남의 대화·피드백 화면에서도 사라진다.
  의도한 것이다 — 차단은 "이 사람을 더는 보지 않겠다" 이지 "다음 소개에서만
  빼 달라" 가 아니다.
*/
create or replace view public_profiles as
select
  p.id,
  p.hub_id,
  p.name,
  case when p.birth is null then null
       else extract(year from age(p.birth))::int end as age,
  p.job,
  p.photo_url,
  p.mbti,
  p.smoking,
  p.drinking,
  p.religion,
  p.headline,
  p.intro,
  p.interests,
  p.match_tags,
  p.topics,
  p.details
from profiles p
where
  -- 본인
  p.id = auth.uid()

  or (
    not is_excluded(auth.uid(), p.id)
    and (
      -- 진행 중인 소개의 상대
      exists (
        select 1 from intros i
         where i.closed_at is null
           and (   (i.male_id   = auth.uid() and i.female_id = p.id)
                or (i.female_id = auth.uid() and i.male_id   = p.id))
      )

      -- 티켓을 쓴 상대. mark_met() 이 소개를 닫으므로 위 절만으로는 만남 직후
      -- 대화방·피드백 화면에서 상대 이름이 사라진다.
      or exists (
        select 1 from meetings m join intros i on i.id = m.intro_id
         where m.cancelled_at is null
           and (   (i.male_id   = auth.uid() and i.female_id = p.id)
                or (i.female_id = auth.uid() and i.male_id   = p.id))
      )

      -- 여성이 평가할 같은 권역 남성 (D2)
      or (my_gender() = 'female' and p.gender = 'male' and is_eligible_candidate(p.id))
    )
  );

comment on view public_profiles is
  '상대에게 노출해도 되는 컬럼만. company_email·birth 는 절대 나가지 않는다. 배제된 상대는 보이지 않는다.';

grant select on public_profiles to authenticated;

-- ─────────── 이미 쌓인 위반 데이터 청소 ───────────

/*
  위 수정은 앞으로를 막을 뿐이다. 이미 배제된 쌍인데 큐에 남아 있는 카드는
  손으로 치워야 한다 — 안 그러면 "고쳤는데 아직도 나온다" 가 된다.
*/
do $$
declare r record; v_gone integer := 0;
begin
  for r in
    delete from intro_queue q
     where q.opened_at is null
       and exists (
         select 1 from intro_exclusions e
          where e.user_lo = least(q.male_id, q.female_id)
            and e.user_hi = greatest(q.male_id, q.female_id))
    returning q.male_id
  loop
    perform promote_intro_queue(r.male_id);
    v_gone := v_gone + 1;
  end loop;
  raise notice 's28b: 배제된 큐 카드 %건 정리', v_gone;
end $$;

-- ═══════════════════ ③ 자격 판정이 봐야 할 것 ═══════════════════

/*
  is_eligible_candidate 는 "이 남성을 여성에게 후보로 보여도 되는가" 를 단독으로
  판정한다. 그런데 **역할을 보지 않아서 운영자 계정이 후보로 나왔다.**
  여성 입장에서 "이 서비스 운영자가 내 평가 대상으로 떠 있다" 는 인식은 신뢰
  축에서 회복하기 어렵다.

  같은 줄에 하나 더 붙인다 — 탈퇴 계정이 되살아난 경우의 방어다. withdraw_account
  는 이름·사진·생일을 지우지만 `email_verified_at` 과 `onboarding_step = 7` 은
  남긴다. 운영자가 실수로 탈퇴 계정을 active 로 되돌리면 **이름도 사진도 없는
  좀비**가 평가 큐에 등장한다. 아래 admin_set_account_state 가드가 1차 방어이고,
  이건 2차다.
*/
create or replace function is_eligible_candidate(p_id uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from profiles t
     where t.id                = p_id
       and t.role             = 'member'
       and t.gender            = 'male'
       and t.email_verified_at is not null
       and t.account_state     = 'active'
       and t.onboarding_step   = 7
       and t.terms_agreed_at   is not null
       and t.privacy_agreed_at is not null
       and t.paused_at         is null
       and t.name              is not null
       and (t.photo_url is null or t.photo_state = 'approved')
       and t.hub_id            = my_hub_id()
  )
$$;

comment on function is_eligible_candidate(uuid) is
  '이 남성을 후보로 보여도 되는가. 운영자·탈퇴 흔적 계정은 제외한다.';

/*
  eligible_profiles 뷰도 같은 규칙을 따라야 한다 — 큐레이션 풀(admin_like_pool)이
  이 뷰를 쓰므로, 여기만 안 고치면 운영자가 큐레이션 화면에서 운영자 계정을 본다.
*/
drop view if exists eligible_profiles;

create view eligible_profiles with (security_invoker = true) as
  select * from profiles
   where role = 'member'
     and email_verified_at is not null
     and account_state = 'active'
     and onboarding_step = 7
     and terms_agreed_at is not null
     and privacy_agreed_at is not null
     and paused_at is null
     and name is not null
     and (photo_url is null or photo_state = 'approved');

comment on view eligible_profiles is
  '소개에 참여할 자격이 있는 회원. 운영자·탈퇴 흔적은 빠진다.';

/*
  탈퇴 계정을 active 로 되돌리지 못하게 한다. 되돌려도 원래 프로필은 이미
  소실됐으므로 복구가 아니라 좀비 생성이다.
*/
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
  -- 운영자를 정지시키면 자기 발등을 찍는다(마지막 운영자면 아무도 못 들어온다).
  if exists (select 1 from profiles where id = p_user and role = 'admin') then
    raise exception 'cannot change an admin account state' using errcode = '42501';
  end if;
  -- 탈퇴는 되돌릴 수 없다. 신원 정보가 이미 지워져 있어 되살리면 빈 계정이 된다.
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
      -- 티켓 주인이 위반자 본인이면 환불하지 않는다.
      if r.ticket_owner <> p_user
         and exists (select 1 from tickets where id = r.ticket_id and state = 'used') then
        perform refund_ticket(r.ticket_id, 'counterpart_banned');
      end if;
    end loop;
  end if;

  insert into admin_actions (admin_id, kind, target_ref, note)
  values (v_uid, case when p_state = 'banned' then 'ban' else 'unban' end, p_user, p_note);

  return v_profile;
end $$;

comment on function admin_set_account_state(uuid, account_state, text) is
  '회원 정지·해제. 탈퇴 계정은 되돌리지 않는다. 정지 시 진행 중 만남을 끊고, 티켓 주인이 위반자가 아니면 환불한다.';

-- ═══════════════════ ④ 여성에게 주문을 팔지 않는다 ═══════════════════

/*
  티켓은 남성만 쓴다(open_intro·use_meeting_ticket 모두 성별 게이트가 있다).
  그런데 주문 생성에는 게이트가 없어서 **여성이 30,000원짜리 주문을 실제로
  만들 수 있었다** — 살 수는 있고 쓸 수는 없는 상태. 운영자 승인 대기열에는
  영원히 이행 불가능한 주문이 쌓인다.

  화면에서 티켓 표면을 지우는 것과 별개로 여기서도 막는다. 화면은 잊을 수 있다.
*/
create or replace function create_ticket_order(
  p_quantity smallint default 1,
  p_kind     ticket_kind default 'meeting'
) returns ticket_orders
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_amount integer;
  v_order  ticket_orders;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if my_gender() <> 'male' then
    raise exception 'tickets are used by male members only' using errcode = '42501';
  end if;

  v_amount := ticket_bundle_amount(p_quantity, p_kind);
  if v_amount is null then
    raise exception 'unsupported quantity % for %', p_quantity, p_kind using errcode = '22023';
  end if;

  insert into ticket_orders (order_id, user_id, amount, quantity, kind)
  values ('ticket_' || replace(gen_random_uuid()::text, '-', ''),
          v_uid, v_amount, p_quantity, p_kind)
  returning * into v_order;

  return v_order;
end $$;

revoke all on function create_ticket_order(smallint, ticket_kind) from public, anon;
grant execute on function create_ticket_order(smallint, ticket_kind) to authenticated;

-- ═══════════════════ ⑤ 여성의 거절 ═══════════════════

/*
  지금까지 여성이 만남 요청을 거절하는 방법은 **24시간 방치**뿐이었다.
  화면에도 버튼이 없고 RPC 도 없다(admin_cancel_meeting 은 운영자 전용).

  이게 왜 나쁜가는 남성 쪽을 보면 분명하다 — 그 24시간 동안 만남 티켓
  30,000원이 묶여 있고, 홈에는 "상대의 답을 기다리는 중" 이 떠 있다. 즉
  **거절이라는 정상적인 답이 시스템에서는 24시간짜리 침묵으로만 표현된다.**
  거절하는 쪽도 편치 않다. 답을 안 하는 것이 유일한 답인 화면은 사람을
  나쁜 사람으로 만든다.

  하는 일은 24시간 만료와 같다(취소 + 환불 + 소개 닫기). 다른 점 둘:
    · 즉시 일어난다 — 남성의 30,000원이 24시간 대신 즉시 풀린다.
    · 배제를 남긴다 — 거절한 상대에게 다시 티켓을 쓰게 두면 그건 환불 규칙이
      아니라 과금 함정이다.
*/
create or replace function decline_meeting(p_meeting_id uuid, p_reason text default null)
  returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_meeting meetings;
  v_intro   intros;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select m.* into v_meeting
    from meetings m join intros i on i.id = m.intro_id
   where m.id = p_meeting_id and i.female_id = v_uid
   for update of m;
  if not found then
    raise exception 'meeting not found for caller' using errcode = '42501';
  end if;
  if v_meeting.cancelled_at is not null then
    raise exception 'meeting already cancelled' using errcode = '42501';
  end if;
  /*
    확정된 뒤에는 이 길로 취소할 수 없다. 그때는 상대가 시간을 비워 둔 뒤이고,
    되돌리는 비용이 양쪽에 걸린다 — 운영자 경유(admin_cancel_meeting)로 남긴다.
  */
  if v_meeting.confirmed_at is not null then
    raise exception 'confirmed meeting cannot be declined here' using errcode = '42501';
  end if;

  select * into v_intro from intros where id = v_meeting.intro_id;

  update meetings
     set cancelled_at = now(), cancel_reason = 'declined'
   where id = p_meeting_id;

  update intros set closed_at = now(), outcome = 'declined'
   where id = v_intro.id and closed_at is null;

  -- 남성의 만남 티켓을 즉시 되돌린다. 24시간 만료와 같은 처리다.
  if exists (select 1 from tickets where id = v_meeting.ticket_id and state = 'used') then
    perform refund_ticket(v_meeting.ticket_id, 'declined');
  end if;

  -- 거절한 상대에게 티켓을 또 쓰게 두지 않는다.
  perform exclude_pair(v_intro.male_id, v_intro.female_id, 'meeting_declined');

  insert into events (user_id, name, props)
  values (v_uid, 'meeting_declined',
          jsonb_build_object('meeting_id', p_meeting_id, 'intro_id', v_intro.id,
                             'reason', p_reason));
end $$;

revoke all on function decline_meeting(uuid, text) from public, anon;
grant execute on function decline_meeting(uuid, text) to authenticated;

comment on function decline_meeting(uuid, text) is
  '여성이 만남 요청을 거절한다. 상대 티켓을 즉시 환불하고 영구 배제한다. 확정된 만남은 대상이 아니다.';
