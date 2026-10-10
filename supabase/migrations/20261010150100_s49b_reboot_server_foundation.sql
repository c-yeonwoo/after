-- S49b — 리부팅 A1: 돈·신뢰 경로 정리와 결정 반영 (docs/reboot-plan.md)
--
-- 2026-10-10 진단에서 롤백 트랜잭션으로 재현한 두 건과, 같은 날 창업자가 정한 두
-- 결정(D5 사진 필수 · D6 취향 문답 제거), 그리고 남성에게 반환을 알리는 알림이다.
--
-- ① 정지·쉬는 여성의 카드가 열렸다. open_intro 는 배제(is_excluded)만 보고 상대의
--    자격을 다시 보지 않았다. 남성은 그 사이 정지된 여성에게 소개 티켓(5,000원)을
--    썼고, 소개 티켓은 반환 경로가 없다. 정지·제명도 큐를 지우지 않았다.
-- ② 소개 받기를 끈 남성에게도 카드가 전송됐다. promote_intro_queue 를 부르는 여섯
--    곳 중 어디도 paused_at 을 보지 않아서 3주 만료가 쉬는 동안 흘렀다. 운영자
--    화면의 "전송되지 않습니다" 는 표시였을 뿐이다.

-- ═══════════════════ D5 사진 필수 ═══════════════════

/*
  지금까지는 "사진이 없거나, 있으면 승인됨" 이었다. 그래서 여성 평가 큐에 이니셜만
  있는 남성이 연달아 나왔다. 이제 승인된 사진이 있어야 후보다. 세 곳이 같은 조건을
  따로 들고 있어서 셋 다 고친다 — 하나만 고치면 큐와 평가가 서로 다른 사람을 본다.
*/
create or replace function profile_candidate_ready(p profiles) returns boolean
  language sql immutable set search_path = public, pg_temp as $$
  select p.role = 'member'
     and p.gender = 'male'
     and p.email_verified_at is not null
     and p.account_state = 'active'
     and p.onboarding_step = 7
     and p.terms_agreed_at is not null
     and p.privacy_agreed_at is not null
     and p.paused_at is null
     and p.name is not null
     and p.photo_url is not null
     and p.photo_state = 'approved'
$$;

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
       and t.photo_url         is not null
       and t.photo_state       = 'approved'
       and t.hub_id            = my_hub_id()
  )
$$;

create or replace view eligible_profiles with (security_invoker = true) as
 select id, gender, hub_id, company_email, email_verified_at, account_state, banned_reason,
        name, birth, job, photo_url, mbti, smoking, drinking, religion, headline, interests,
        match_tags, topics, onboarding_step, created_at, updated_at, intro, details,
        match_note, topic_note, terms_agreed_at, privacy_agreed_at, agreed_policy_version,
        feedback_emails, paused_at, role, photo_state, photo_reviewed_at, photo_reviewed_by,
        photo_reject_reason
   from profiles
  where role = 'member'
    and email_verified_at is not null
    and account_state = 'active'
    and onboarding_step = 7
    and terms_agreed_at is not null
    and privacy_agreed_at is not null
    and paused_at is null
    and name is not null
    and photo_url is not null
    and photo_state = 'approved';

-- ═══════════════════ ① 열 때 상대 자격을 다시 본다 ═══════════════════

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

  select * into v_intro from intros
   where male_id = v_uid and closed_at is null;
  if found then
    return v_intro;
  end if;

  /*
    전송된 뒤에 상대가 쉬기를 켰거나 정지됐을 수 있다. 그 카드는 건너뛴다 —
    돈을 받고 열어 준 뒤에 "이분과는 진행할 수 없습니다" 가 되면 안 된다.
  */
  select * into v_card from intro_queue q
   where q.male_id = v_uid
     and q.opened_at is null
     and q.delivered_at is not null
     and q.expires_at > now()
     and not is_excluded(v_uid, q.female_id)
     and exists (select 1 from eligible_profiles e
                  where e.id = q.female_id and e.gender = 'female')
   order by q.position, q.created_at
   limit 1
   for update of q skip locked;
  if not found then
    raise exception 'no eligible candidate' using errcode = 'P0002';
  end if;

  select * into v_ticket from tickets
   where user_id = v_uid and state = 'unused' and kind = 'intro'
     and expires_at > now() and not refund_locked
   order by expires_at, issued_at
   limit 1
   for update skip locked;
  if not found then
    raise exception 'no unused intro ticket' using errcode = 'P0003';
  end if;

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

-- ═══════════════════ ② 쉬는 남성에게는 보내지 않는다 ═══════════════════

/*
  호출하는 곳이 여섯이라 호출부가 아니라 여기서 막는다. 자격 없는 여성의 카드도
  창(상위 3장)에 넣지 않는다 — 넣으면 남성 홈은 "도착했어요" 인데 열 수 없다.
*/
create or replace function promote_intro_queue(p_male uuid) returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if exists (select 1 from profiles where id = p_male and paused_at is not null) then
    return 0;
  end if;

  with top3 as (
    select q.id from intro_queue q
     where q.male_id = p_male and q.opened_at is null
       and exists (select 1 from eligible_profiles e
                    where e.id = q.female_id and e.gender = 'female')
     order by q.position, q.created_at
     limit 3
  )
  update intro_queue q
     set delivered_at = now(),
         expires_at   = now() + interval '3 weeks'
    from top3
   where q.id = top3.id and q.delivered_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

/* 다시 켜면 그동안 막아 둔 카드가 바로 나가야 한다. */
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

  if not p_on and v_me.gender = 'male' then
    perform promote_intro_queue(v_me.id);
  end if;

  insert into events (user_id, name, props)
  values (auth.uid(), case when p_on then 'paused' else 'resumed' end, '{}'::jsonb);

  return v_me;
end $$;

-- ─────────── 정지·제명은 큐를 비운다 ───────────

/*
  정지 경로가 넷(운영자 상태 변경 · 노쇼 확정 · 신고 처리 · 일괄)이라 각각 고치지
  않고 상태가 바뀌는 지점 하나에 건다. 탈퇴는 s29 가 이미 지운다.
  열린 소개(opened_at)는 건드리지 않는다 — 진행 중인 약속은 만남 취소 경로가 맡는다.
*/
create or replace function purge_queue_on_inactive() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from intro_queue
   where opened_at is null
     and (male_id = new.id or female_id = new.id);
  return new;
end $$;

revoke all on function purge_queue_on_inactive() from public, anon, authenticated;

drop trigger if exists profiles_purge_queue_on_inactive on profiles;
create trigger profiles_purge_queue_on_inactive
  after update of account_state on profiles
  for each row
  when (old.account_state = 'active' and new.account_state <> 'active')
  execute function purge_queue_on_inactive();

-- ═══════════════════ D6 취향 문답 제거 ═══════════════════

/*
  답할 화면이 2026-09-13(7286f5a) 에 사라졌고, 운영자 비교표는 신규 가입자에게 늘
  0/0 이었다. 창업자 결정으로 걷어낸다. 테이블은 지우지 않는다 — 이미 쌓인 답을
  되돌릴 수 없게 지우는 일은 이 변경의 목적이 아니다. 쓰기만 닫는다.
*/
drop function if exists admin_preference_compare(uuid, uuid);

drop function if exists admin_like_pool(uuid);
create function admin_like_pool(p_male uuid)
  returns table(id uuid, name text, birth date, job text, photo_url text,
                photo_state photo_state, mbti text, smoking text, drinking text,
                religion text, hub_id text, headline text, intro text, interests text[],
                match_tags text[], topics text[], details jsonb,
                liked_at timestamptz, waiting_hours integer)
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select p.id, p.name, p.birth, p.job, p.photo_url, p.photo_state,
         p.mbti, p.smoking, p.drinking, p.religion, p.hub_id,
         p.headline, p.intro, p.interests, p.match_tags, p.topics, p.details,
         a.created_at,
         round(extract(epoch from (now() - a.created_at)) / 3600)::integer
    from affinities a
    join eligible_profiles p on p.id = a.from_id
   where a.to_id = p_male
     and a.verdict = 'like'
     and p.gender = 'female'
     and not is_excluded(p_male, a.from_id)
     and not exists (select 1 from intro_queue q
                      where q.male_id = p_male and q.female_id = a.from_id)
     and not exists (select 1 from intros i
                      where i.male_id = p_male and i.female_id = a.from_id)
   order by a.created_at;
end $$;

revoke all on function admin_like_pool(uuid) from public, anon;
grant execute on function admin_like_pool(uuid) to authenticated;

drop function if exists preference_agreement(uuid, uuid);

revoke all on preference_answers from authenticated, anon;
comment on table preference_answers is
  '2026-10-10 (s49b) 사용 중단. 취향 문답을 걷어냈다. 쌓인 답은 보존하고 쓰기만 닫았다.';

-- ═══════════════════ 남성에게 반환을 알린다 ═══════════════════

/*
  거절·24시간 무응답이면 남성의 만남 티켓은 이미 서버가 돌려준다. 그런데 남성은 그
  사실을 앱을 열기 전까지 몰랐다. 해자로 내세우는 "안 되면 돌려준다" 가 작동하는
  순간이 소리 없이 지나갔다.
*/
create or replace function meetings_notify() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- 티켓 사용 = 만남 행 생성. 여성에게 "요청이 도착했다".
  if tg_op = 'INSERT' then
    perform enqueue_meeting_notification(new.id, 'meeting_requested', true);
    return new;
  end if;

  -- 여성이 가능한 날을 보냈다. 남성에게 "답이 왔다".
  if old.prefs_submitted_at is null and new.prefs_submitted_at is not null then
    perform enqueue_meeting_notification(new.id, 'prefs_submitted', false);
  end if;

  -- 남성이 확정했다. 여성에게 "대화가 열렸다".
  if old.confirmed_at is null and new.confirmed_at is not null then
    perform enqueue_meeting_notification(new.id, 'meeting_confirmed', true);
  end if;

  -- 확정 전에 여성 쪽 사정(거절·무응답)으로 끝났다. 남성에게 "티켓은 돌려드렸다".
  if old.cancelled_at is null and new.cancelled_at is not null
     and new.confirmed_at is null
     and new.cancel_reason in ('declined', 'no_response_24h') then
    perform enqueue_meeting_notification(new.id, 'meeting_released', false);
  end if;

  return new;
end $$;
