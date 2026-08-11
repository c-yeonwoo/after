-- S20 — 소개 큐 (운영자 큐레이션) + 소개 열람 유료화
--
-- docs/intro-flow-v2.md 의 핵심. 여성의 호감이 곧바로 소개가 되던 흐름(v1)에
-- **운영자 큐레이션**을 끼워 넣고, 소개 열람을 유료(소개 티켓 1장)로 만든다.
--
-- 불변식은 유지된다 — 큐를 만들 수 있는 풀 자체가 "나를 좋다고 한 여성" 이므로
-- 화면의 *"이분이 먼저 회원님을 좋다고 하셨어요"* 는 여전히 참이다.

-- ─────────────────── 큐 ───────────────────

/*
  큐(대기)와 소개(열림)를 나눈다. 큐는 운영자 소유이고 intros 는 남성이 소개
  티켓을 써서 연 결과다. 섞으면 "아직 안 본 것"과 "본 것"의 경계가 흐려진다.

  ── 상한을 전송 기준으로 옮겼다 ──
  문서 §3-2 는 "남성 1명당 미열람 카드 3장" 을 큐 자체의 상한으로 뒀지만,
  운영자가 미리 긴 줄을 세울 수 있게 바꿨다. 대신 남성에게 한 번에 보이는 것은
  상위 3장이고 나머지는 대기한다.

  그래서 **만료를 큐 진입이 아니라 전송 시점부터 센다.** 담긴 시점부터 3주를
  세면 뒤에서 기다리던 카드가 열려보지도 못하고 만료된다 — 큐레이션 노동이
  그대로 새는 구조가 된다. expires_at 은 delivered_at 과 함께 채워진다.
*/
create table intro_queue (
  id           uuid primary key default gen_random_uuid(),
  male_id      uuid not null references profiles(id) on delete cascade,
  female_id    uuid not null references profiles(id) on delete cascade,
  position     integer not null,
  curated_by   uuid not null references profiles(id),
  note         text,
  -- 남성 화면에 "도착" 으로 뜬 시각. 상위 3장에 들어온 순간 채워진다.
  delivered_at timestamptz,
  -- 소개 티켓을 써서 연 시각. 채워지면 이 카드는 대기열에서 빠진다.
  opened_at    timestamptz,
  -- 전송 + 3주. delivered_at 이 null 이면 아직 시계가 돌지 않는다.
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),

  unique (male_id, female_id),
  check (male_id <> female_id),
  -- 전송되지 않은 카드에는 만료도 없다. 둘은 항상 함께 채워진다.
  check ((delivered_at is null) = (expires_at is null))
);

create index on intro_queue (male_id, position) where opened_at is null;
create index on intro_queue (expires_at) where opened_at is null and delivered_at is not null;

comment on table intro_queue is
  '운영자가 세운 소개 대기열. 상위 3장만 남성에게 전송되고 만료는 전송 시점부터 3주.';

alter table intro_queue enable row level security;
grant select on intro_queue to authenticated;

/*
  남성은 자기 큐에서 **전송된 미열람 카드만** 본다. 대기 중인 뒷줄까지 보이면
  "몇 명이 나를 좋아하는지" 가 새어 나가고, 그건 큐레이션 이전의 정보다.
  여성 쪽에는 아예 보이지 않는다 — 자기가 누구의 큐에 있는지 알 이유가 없다.
*/
create policy intro_queue_own_delivered on intro_queue
  for select to authenticated using (
    male_id = auth.uid()
      and opened_at is null
      and delivered_at is not null
      and expires_at > now()
  );

create policy intro_queue_admin on intro_queue
  for select to authenticated using (is_admin());

-- ─────────────────── 전송 (상위 3장 승격) ───────────────────

/*
  미열람 카드 중 position 이 앞선 3장을 전송 상태로 올린다.

  크론에 맡기지 않고 **큐가 바뀌는 순간마다 부른다** — 운영자가 방금 세운 줄이
  15분 뒤에야 닿으면 수동 운영에서 그 지연이 곧 CS 다. 크론은 만료만 맡는다.

  내부 함수다. 어떤 롤에도 EXECUTE 를 주지 않는다.
*/
create or replace function promote_intro_queue(p_male uuid) returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  with top3 as (
    select id from intro_queue
     where male_id = p_male and opened_at is null
     order by position, created_at
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

comment on function promote_intro_queue(uuid) is
  '미열람 상위 3장을 전송 상태로. 만료 시계는 여기서 시작한다.';

-- ─────────────────── 만료 ───────────────────

/*
  전송됐지만 3주 동안 열리지 않은 카드를 치운다.

  **남성에게는 조용히, 운영자에게는 숫자로** (문서 §8). 열지 않은 카드가
  사라지는 것이라 남성 입장에서 잃은 것이 없고, "소개가 만료됐습니다" 는
  하지 않은 일에 대한 부정적 통지라 얻는 게 없다. 운영자 쪽은 다르다 — 만료
  건수는 큐레이션이 헛돌았다는 신호다.

  치운 자리에 대기하던 카드를 올린다. 안 그러면 뒷줄이 영원히 안 나간다.
*/
create or replace function expire_intro_queue() returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer := 0; r record;
begin
  for r in
    select distinct male_id from intro_queue
     where opened_at is null and delivered_at is not null and expires_at <= now()
  loop
    with gone as (
      delete from intro_queue
       where male_id = r.male_id
         and opened_at is null and delivered_at is not null and expires_at <= now()
      returning female_id
    )
    insert into events (user_id, name, props)
    select r.male_id, 'intro_queue_expired',
           jsonb_build_object('female_id', female_id)
      from gone;
    v_count := v_count + 1;

    -- 빈 자리에 뒷줄을 올린다.
    perform promote_intro_queue(r.male_id);
  end loop;
  return v_count;
end $$;

comment on function expire_intro_queue() is
  '3주 미열람 카드 정리 + 뒷줄 승격. 남성에게 알리지 않는다(§8).';

revoke all on function expire_intro_queue() from public, anon, authenticated;
grant execute on function expire_intro_queue() to service_role;

-- 기존 4개 옆에 다섯 번째 잡.
select cron.schedule('expire_intro_queue_15m', '*/15 * * * *',
                     $$ select expire_intro_queue(); $$);

-- ─────────────────── 운영자: 호감 풀 ───────────────────

/*
  이 남성을 좋다고 한 여성들 중 아직 큐에 없고 배제되지 않은 사람.

  후보 자격(사진 검수·쉬는 중·정지 등)은 eligible_profiles 가 단독으로 판정한다
  — 조건을 여기 복제하면 s14·s18 이 경고한 "게이트가 갈리는" 함정에 빠진다.

  화면이 카드를 그리려면 프로필 전체가 필요하다. public_profiles 는 호출자
  기준이라 운영자에게는 자기 것만 보이므로 여기서 직접 낸다.
*/
create function admin_like_pool(p_male uuid)
  returns table (
    id          uuid,
    name        text,
    birth       date,
    job         text,
    photo_url   text,
    photo_state photo_state,
    mbti        text,
    smoking     text,
    drinking    text,
    religion    text,
    hub_id      text,
    headline    text,
    intro       text,
    interests   text[],
    match_tags  text[],
    topics      text[],
    details     jsonb,
    liked_at    timestamptz,
    waiting_hours integer
  )
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
     -- 이미 큐에 있거나 이미 소개된 사람은 풀에서 뺀다.
     and not exists (select 1 from intro_queue q
                      where q.male_id = p_male and q.female_id = a.from_id)
     and not exists (select 1 from intros i
                      where i.male_id = p_male and i.female_id = a.from_id)
   -- 오래 기다린 호감이 위로. 적체를 줄이는 순서다.
   order by a.created_at;
end $$;

comment on function admin_like_pool(uuid) is
  '이 남성을 좋다고 한, 아직 큐에 없는 여성들. 오래 기다린 순.';

-- ─────────────────── 운영자: 큐 설정 ───────────────────

/*
  큐를 통째로 덮어쓴다. 부분 수정이 아니다 — 순서 재배열이 잦을 것이므로
  "이 남성의 큐는 이 순서" 를 한 번에 받는 편이 단순하고, 화면도 저장 전까지
  로컬에서 마음껏 순서를 바꿀 수 있다.

  이미 전송된 카드의 시계는 **건드리지 않는다.** 순서를 만지느라 delivered_at 을
  다시 찍으면 만료가 계속 미뤄져 3주 상한이 무의미해진다.

  이미 열린 카드(opened_at)는 목록에서 빠져도 지우지 않는다 — 그건 기록이다.
*/
create function admin_set_queue(p_male uuid, p_female_ids uuid[], p_note text)
  returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_i   integer;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'note required' using errcode = '22023';
  end if;
  if not exists (select 1 from profiles where id = p_male and gender = 'male') then
    raise exception 'not a male member' using errcode = '22023';
  end if;
  if array_position(p_female_ids, p_male) is not null then
    raise exception 'cannot queue self' using errcode = '22023';
  end if;

  -- 풀에 없는 사람을 큐에 넣으려는 시도를 막는다. 불변식("나를 좋다고 한
  -- 여성만")이 여기서 지켜진다 — 화면을 우회해 임의의 여성을 밀어 넣을 수 없다.
  if exists (
    select 1 from unnest(p_female_ids) as f(id)
     where not exists (
       select 1 from affinities a
        where a.to_id = p_male and a.from_id = f.id and a.verdict = 'like')
  ) then
    raise exception 'queue must come from the like pool' using errcode = '42501';
  end if;

  -- 목록에서 빠진 미열람 카드를 지운다.
  delete from intro_queue
   where male_id = p_male
     and opened_at is null
     and (p_female_ids is null or female_id <> all(p_female_ids));

  -- 순서를 새로 쓴다. 이미 있는 행은 position 만 갱신하고 시계는 보존한다.
  for v_i in 1 .. coalesce(array_length(p_female_ids, 1), 0) loop
    insert into intro_queue (male_id, female_id, position, curated_by, note)
    values (p_male, p_female_ids[v_i], v_i, v_uid, p_note)
    on conflict (male_id, female_id) do update
      set position   = excluded.position,
          curated_by = excluded.curated_by,
          note       = excluded.note;
  end loop;

  perform promote_intro_queue(p_male);

  insert into admin_actions (actor_id, kind, target_user, target_ref, note)
  values (v_uid, 'set_queue', p_male, null,
          format('%s장 — %s', coalesce(array_length(p_female_ids, 1), 0), p_note));

  return coalesce(array_length(p_female_ids, 1), 0);
end $$;

comment on function admin_set_queue(uuid, uuid[], text) is
  '큐를 순서째 덮어쓴다. 전송된 카드의 만료 시계는 보존한다.';

-- 개입 종류 하나 추가.
alter table admin_actions drop constraint if exists admin_actions_kind_check;
alter table admin_actions add constraint admin_actions_kind_check check (
  kind in ('resolve_report', 'ban', 'unban', 'refund', 'cancel_meeting',
           'review_photo', 'set_queue')
);

-- ─────────────────── 운영자: 작업 대상 목록 ───────────────────

/*
  누구부터 손대야 하는가. 큐가 빈 활성 남성이 위로, 그중 오래 기다린 호감을
  가진 순이다 — 이 정렬이 곧 "지금 아무것도 못 받는 사람" 부터라는 뜻이다.
*/
create function admin_curation_targets()
  returns table (
    id             uuid,
    name           text,
    hub_id         text,
    photo_url      text,
    receiving      boolean,
    pool_count     bigint,
    queued_count   bigint,
    delivered_count bigint,
    oldest_like_hours integer,
    has_open_intro boolean
  )
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select p.id, p.name, p.hub_id, p.photo_url,
         -- "소개 받기" 가 켜져 있는가. 남성 쪽 paused_at 이 그 토글이다.
         (p.paused_at is null) as receiving,
         (select count(*) from affinities a
           where a.to_id = p.id and a.verdict = 'like'
             and not is_excluded(p.id, a.from_id)
             and not exists (select 1 from intro_queue q
                              where q.male_id = p.id and q.female_id = a.from_id)
             and not exists (select 1 from intros i
                              where i.male_id = p.id and i.female_id = a.from_id)),
         (select count(*) from intro_queue q
           where q.male_id = p.id and q.opened_at is null),
         (select count(*) from intro_queue q
           where q.male_id = p.id and q.opened_at is null
             and q.delivered_at is not null and q.expires_at > now()),
         (select round(extract(epoch from (now() - min(a.created_at))) / 3600)::integer
            from affinities a
           where a.to_id = p.id and a.verdict = 'like'
             and not exists (select 1 from intro_queue q
                              where q.male_id = p.id and q.female_id = a.from_id)
             and not exists (select 1 from intros i
                              where i.male_id = p.id and i.female_id = a.from_id)),
         exists (select 1 from intros i where i.male_id = p.id and i.closed_at is null)
    from profiles p
   where p.gender = 'male'
     and p.account_state = 'active'
     and p.onboarding_step = 7
     and p.role <> 'admin'
   -- 큐가 비었고 풀에 사람이 있는 남성이 최우선. 그 다음 오래 기다린 순.
   order by
     (select count(*) from intro_queue q
       where q.male_id = p.id and q.opened_at is null) asc,
     (select min(a.created_at) from affinities a
       where a.to_id = p.id and a.verdict = 'like') asc nulls last,
     p.created_at;
end $$;

comment on function admin_curation_targets() is
  '큐레이션 작업 대상. 큐가 빈 사람부터, 그중 오래 기다린 순.';

-- ─────────────────── 사용자: 소개 열기 (재작성) ───────────────────

/*
  큐에서 다음 카드를 열고 **소개 티켓 1장을 차감한다.**

  v1 은 "나를 좋다고 한 여성 중 가장 오래된 한 명" 을 직접 골랐다. 이제 그 선택은
  운영자가 미리 했고, 이 함수는 큐의 맨 앞을 꺼낸다.

  불변식 2(동시 1건)는 그대로다 — 이미 열린 미결정 소개가 있으면 그것을 반환하고
  티켓을 쓰지 않는다.
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

  -- 큐의 맨 앞. 전송됐고 아직 열지 않았고 만료되지 않은 것.
  select * into v_card from intro_queue
   where male_id = v_uid
     and opened_at is null
     and delivered_at is not null
     and expires_at > now()
   order by position, created_at
   limit 1
   for update skip locked;
  if not found then
    raise exception 'no eligible candidate' using errcode = 'P0002';
  end if;

  /*
    소개 티켓을 차감한다. 만남 티켓과 섞이지 않게 kind 로 좁힌다 —
    s19 가 종류를 붙인 이유가 정확히 이 지점이다.
  */
  select * into v_ticket from tickets
   where user_id = v_uid and state = 'unused' and kind = 'intro'
   order by issued_at
   limit 1
   for update skip locked;
  if not found then
    raise exception 'no unused intro ticket' using errcode = 'P0003';
  end if;

  /*
    소개를 **먼저** 만든 뒤 티켓을 거기에 붙인다.

    tickets_check2 가 `state = 'used' → intro_id is not null` 을 요구한다(s1).
    티켓을 먼저 used 로 바꾸면 그 제약에 걸린다. 순서를 뒤집으면 제약도 지켜지고
    "이 소개 티켓이 어느 소개를 열었나" 가 행에 남아 정산도 추적된다.
  */
  insert into intros (male_id, female_id) values (v_uid, v_card.female_id)
  returning * into v_intro;

  update tickets
     set state = 'used', used_at = now(), intro_id = v_intro.id
   where id = v_ticket.id;

  update intro_queue set opened_at = now() where id = v_card.id;
  -- 한 자리가 비었으니 뒷줄을 올린다.
  perform promote_intro_queue(v_uid);

  insert into events (user_id, name, props)
  values (v_uid, 'intro_opened',
          jsonb_build_object('intro_id', v_intro.id, 'ticket_id', v_ticket.id,
                             'curated_by', v_card.curated_by));

  return v_intro;
end $$;

comment on function open_intro() is
  '큐의 맨 앞 카드를 열고 소개 티켓 1장을 차감한다. 티켓이 없으면 P0003.';

/*
  패스. 소개 티켓은 **환불하지 않는다**(소멸). 큐에서도 치운다 — exclude_pair 가
  영구 배제를 걸므로 다시 큐에 올라올 수도 없다.
*/
create or replace function pass_intro(p_intro_id uuid) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_intro intros;
begin
  select * into v_intro from intros
   where id = p_intro_id and male_id = v_uid and closed_at is null
   for update;
  if not found then
    raise exception 'intro not open for caller' using errcode = '42501';
  end if;

  update intros set closed_at = now(), outcome = 'passed' where id = p_intro_id;
  perform exclude_pair(v_intro.male_id, v_intro.female_id, 'intro_passed');

  delete from intro_queue
   where male_id = v_intro.male_id and female_id = v_intro.female_id;
  perform promote_intro_queue(v_intro.male_id);

  insert into events (user_id, name, props)
  values (v_uid, 'intro_passed', jsonb_build_object('intro_id', p_intro_id));
end $$;

-- ─────────────────── 홈 ───────────────────

/*
  홈이 "소개가 도착했습니다" 를 띄울 근거가 바뀐다. v1 은 호감이 있으면 곧
  소개였지만 이제는 **큐에 전송된 카드가 있어야** 한다.

  소개 티켓 보유량도 함께 낸다 — 열람 버튼이 "티켓 1장을 사용합니다" 를
  말하려면 몇 장 있는지 알아야 한다.
*/
create or replace function home_state() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid       uuid := auth.uid();
  v_me        profiles;
  v_gender    gender;
  v_meeting   meetings;
  v_intro_id  uuid;
  v_cand_id   uuid;
  v_req_cnt   integer := 0;
  v_noshow    no_show_reports;
  v_cand      jsonb;
  v_queued    integer := 0;
  v_intro_tix integer := 0;
  v_meet_tix  integer := 0;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select * into v_me from profiles where id = v_uid;
  if not found then
    return jsonb_build_object('me', null);
  end if;
  v_gender := v_me.gender;

  -- 확정된 만남이 최우선이다. 이게 있으면 홈은 그 카드만 보여준다.
  select m.* into v_meeting
    from meetings m join intros i on i.id = m.intro_id
   where v_uid in (i.male_id, i.female_id)
     and m.cancelled_at is null
     and m.confirmed_at is not null
   order by m.created_at desc
   limit 1;

  if v_meeting.id is not null then
    select case when i.male_id = v_uid then i.female_id else i.male_id end
      into v_cand_id
      from intros i where i.id = v_meeting.intro_id;
  end if;

  if v_gender = 'male' then
    select i.id, i.female_id into v_intro_id, v_cand_id
      from intros i
     where i.male_id = v_uid and i.closed_at is null;

    if v_intro_id is not null and v_meeting.id is null then
      select m.* into v_meeting
        from meetings m
       where m.intro_id = v_intro_id and m.cancelled_at is null;
    end if;

    if v_meeting.id is not null and v_meeting.confirmed_at is not null then
      select case when i.male_id = v_uid then i.female_id else i.male_id end
        into v_cand_id
        from intros i where i.id = v_meeting.intro_id;
    end if;

    /*
      "소개가 도착했습니다" 의 근거가 바뀐다. v1 은 호감이 있으면 곧 소개였지만
      이제는 **운영자가 세운 큐에 전송된 카드**가 있어야 한다.
    */
    select count(*) into v_queued from intro_queue
     where male_id = v_uid and opened_at is null
       and delivered_at is not null and expires_at > now();
  else
    select count(*) into v_req_cnt
      from meetings m join intros i on i.id = m.intro_id
     where i.female_id = v_uid
       and i.closed_at is null
       and m.prefs_submitted_at is null
       and m.cancelled_at is null;

    if v_meeting.id is null then
      if v_req_cnt > 0 then
        select m.* into v_meeting
          from meetings m join intros i on i.id = m.intro_id
         where i.female_id = v_uid
           and i.closed_at is null
           and m.prefs_submitted_at is null
           and m.cancelled_at is null
         order by m.created_at
         limit 1;

        select i.male_id into v_cand_id
          from intros i where i.id = v_meeting.intro_id;
      else
        select nc.id into v_cand_id from next_candidate() nc;
      end if;
    end if;
  end if;

  select * into v_noshow
    from no_show_reports
   where accused_id = v_uid and state = 'pending'
   order by created_at
   limit 1;

  if v_cand_id is not null then
    select to_jsonb(pp) into v_cand from public_profiles pp where pp.id = v_cand_id;
  end if;

  -- 종류별 보유량. 열람 버튼이 "소개 티켓 1장을 사용합니다" 를 말하려면 필요하다.
  select coalesce(count(*) filter (where kind = 'intro'), 0),
         coalesce(count(*) filter (where kind = 'meeting'), 0)
    into v_intro_tix, v_meet_tix
    from tickets where user_id = v_uid and state = 'unused';

  return jsonb_build_object(
    'me',                   to_jsonb(v_me),
    'candidate',            v_cand,
    'meeting',              case when v_meeting.id is null then null else to_jsonb(v_meeting) end,
    'request_count',        v_req_cnt,
    'pending_no_show',      case when v_noshow.id is null then null else to_jsonb(v_noshow) end,
    'has_open_intro',       v_intro_id is not null,
    'queued_intros',        v_queued,
    'intro_tickets',        v_intro_tix,
    'meeting_tickets',      v_meet_tix
  );
end $$;

comment on function home_state is
  '홈 상태 + 큐 카드 수 · 종류별 티켓 보유량. 소개 오픈은 open_intro() 가 따로 한다.';

-- ─────────────────── 대시보드 ───────────────────

/*
  적체·품질 지표를 v2 기준으로 바꾼다.

  v1 은 "아직 소개로 이어지지 않은 호감" 을 적체로 셌다(그게 곧 큐레이션 대기의
  대리 지표였다). 이제 실제 큐가 있으니 직접 센다.

  품질 쪽에 **패스율**과 **큐레이션 → 열람 전환율**을 넣는다. 문서 §2 가
  "이게 없으면 품질을 관리할 방법이 없다" 고 못박은 값이고, 후자는 품질 지표가
  아니라 단위 경제 지표다(§5) — 큐레이션 노동이 회수되는 비율이다.
*/
create or replace function admin_dashboard() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'members', jsonb_build_object(
      'female', (select count(*) from profiles
                  where gender = 'female' and account_state = 'active'
                    and onboarding_step >= 7 and role <> 'admin'),
      'male',   (select count(*) from profiles
                  where gender = 'male'   and account_state = 'active'
                    and onboarding_step >= 7 and role <> 'admin'),
      'paused', (select count(*) from profiles
                  where paused_at is not null and account_state = 'active'
                    and role <> 'admin'),
      'banned', (select count(*) from profiles
                  where account_state = 'banned' and role <> 'admin')
    ),

    'flow', jsonb_build_object(
      'open_intros',      (select count(*) from intros  where closed_at is null),
      'active_meetings',  (select count(*) from meetings
                            where cancelled_at is null and completed_at is null),
      'confirmed',        (select count(*) from meetings
                            where confirmed_at is not null
                              and cancelled_at is null and completed_at is null),
      'completed',        (select count(*) from meetings where completed_at is not null),
      'queued_cards',     (select count(*) from intro_queue where opened_at is null)
    ),

    'backlog', jsonb_build_object(
      'pending_reports',   (select count(*) from content_reports where state = 'pending'),
      'pending_no_shows',  (select count(*) from no_show_reports where state = 'pending'),
      'pending_photos',    (select count(*) from profiles
                             where photo_url is not null and photo_state = 'pending'
                               and role <> 'admin'),
      -- 큐레이션 대기 = 아직 어느 큐에도 들어가지 않은 호감
      'unmatched_likes',   (select count(*) from affinities a
                             where a.verdict = 'like'
                               and not exists (select 1 from intro_queue q
                                                where q.male_id = a.to_id
                                                  and q.female_id = a.from_id)
                               and not exists (select 1 from intros i
                                                where i.male_id = a.to_id
                                                  and i.female_id = a.from_id)),
      -- 큐가 비어 지금 아무것도 못 받는 활성 남성
      'starved_males',     (select count(*) from profiles p
                             where p.gender = 'male' and p.account_state = 'active'
                               and p.onboarding_step = 7 and p.paused_at is null
                               and p.role <> 'admin'
                               and not exists (select 1 from intro_queue q
                                                where q.male_id = p.id
                                                  and q.opened_at is null)),
      'oldest_like_hours', (select round(extract(epoch from (now() - min(a.created_at))) / 3600)
                              from affinities a
                             where a.verdict = 'like'
                               and not exists (select 1 from intro_queue q
                                                where q.male_id = a.to_id
                                                  and q.female_id = a.from_id)
                               and not exists (select 1 from intros i
                                                where i.male_id = a.to_id
                                                  and i.female_id = a.from_id))
    ),

    'quality', jsonb_build_object(
      'intros_total',  (select count(*) from intros),
      'intros_passed', (select count(*) from intros where outcome = 'passed'),
      'intros_used',   (select count(*) from intros where outcome = 'ticket_used'),
      -- 큐레이션 노동이 회수되는 비율 (§5). 낮으면 노동이 새고 있다.
      'cards_delivered', (select count(*) from intro_queue where delivered_at is not null),
      'cards_opened',    (select count(*) from intro_queue where opened_at is not null),
      'cards_expired',   (select count(*) from events where name = 'intro_queue_expired')
    )
  ) into v;

  return v;
end $$;

-- ─────────────────── 권한 ───────────────────

revoke all on function promote_intro_queue(uuid)                 from public, anon, authenticated;
revoke all on function admin_like_pool(uuid)                     from public, anon;
revoke all on function admin_set_queue(uuid, uuid[], text)       from public, anon;
revoke all on function admin_curation_targets()                  from public, anon;

grant execute on function admin_like_pool(uuid)                   to authenticated;
grant execute on function admin_set_queue(uuid, uuid[], text)     to authenticated;
grant execute on function admin_curation_targets()                to authenticated;
