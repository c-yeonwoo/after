-- S22 — 큐레이터별 지표
--
-- docs/admin-design.md §4 와 intro-flow-v2.md §2 가 요구한 마지막 지표다.
-- intro_queue.curated_by 는 s20 부터 기록해 왔고 집계만 없었다.
--
-- ── 처음 시도가 틀렸다: intro_queue 만으로는 셀 수 없다 ──
--
-- 카드 한 장이 지나는 길에서 **행이 사라지는 경로가 둘** 있다.
--   · pass_intro()        패스하면 큐 행을 지운다
--   · expire_intro_queue() 만료되면 큐 행을 지운다
--
-- 그래서 살아남은 intro_queue 행으로 세면 담은 수가 줄고 패스는 0 이 된다
-- (실제로 담음 4·패스 1 인 데이터에서 담음 2·패스 0 이 나왔다).
--
-- 열린 카드의 **내구성 있는 기록은 intros** 다. 그래서 소개 행에 큐레이터를
-- 새기고, 카드를 세 갈래로 나눠 정확히 한 번씩 센다.
--
--   대기  intro_queue 에 남아 있고 아직 안 열린 것
--   열림  intros (curated_by 가 있는 것) — 결말도 여기 있다
--   만료  events.intro_queue_expired
--
-- 세 갈래는 겹치지 않는다. 카드는 대기 중이거나, 열렸거나, 만료됐다.

-- ─────────────────── 소개에 큐레이터를 새긴다 ───────────────────

alter table intros add column curated_by uuid references profiles(id);

comment on column intros.curated_by is
  '이 소개를 만든 큐레이션 카드의 작성자. v1 소개는 null — 큐 없이 열렸다.';

create index on intros (curated_by) where curated_by is not null;

/*
  open_intro() 가 카드를 소개로 승격시킬 때 큐레이터를 함께 옮긴다. 이미
  이벤트에는 남기고 있었는데(s20), 이벤트는 집계용 조회에 쓰기 나쁘다 —
  props 를 캐스팅해야 하고 인덱스도 못 탄다.
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
  '큐의 맨 앞 카드를 열고 소개 티켓 1장을 차감한다. 티켓이 없으면 P0003.';

-- ─────────────────── 만료 이벤트에 큐레이터를 싣는다 ───────────────────

/*
  만료된 카드는 행이 삭제되므로 이벤트로만 셀 수 있는데, s20 의 이벤트에는
  큐레이터가 없었다 — 그러면 "큐레이터별 만료" 를 영원히 0 으로 내보내게 된다.
  **항상 0 인 칸은 없는 것보다 나쁘다.**

  이 마이그레이션 이전에 남은 만료 이벤트에는 curated_by 가 없어 어느 큐레이터
  에도 잡히지 않는다. 큐가 방금 배포됐으므로 실사용 데이터에는 해당이 없다.
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
      returning female_id, curated_by
    )
    insert into events (user_id, name, props)
    select r.male_id, 'intro_queue_expired',
           jsonb_build_object('female_id', female_id, 'curated_by', curated_by)
      from gone;
    v_count := v_count + 1;

    perform promote_intro_queue(r.male_id);
  end loop;
  return v_count;
end $$;

comment on function expire_intro_queue() is
  '3주 미열람 카드 정리 + 뒷줄 승격. 남성에게 알리지 않는다(§8). '
  '이벤트에 curated_by 를 남겨 큐레이터별 만료를 셀 수 있게 한다.';

-- ─────────────────── 큐레이터별 퍼널 ───────────────────

/*
  ── 비율을 서버에서 계산하지 않는다 ──
  분자·분모를 그대로 낸다. 서버가 40% 만 내보내면 화면은 그게 2/5 인지 40/100
  인지 모르고, 운영자는 1/1 을 100% 로 읽는다. 표본 크기를 감추면 안 되는
  지표라서 나눗셈은 화면이 한다.
*/
create function admin_curator_stats(p_since timestamptz default null)
  returns table (
    curator_id   uuid,
    curator_name text,
    -- 담은 카드 = 대기 + 열림 + 만료. 세 갈래가 겹치지 않는다.
    curated      bigint,
    -- 남성에게 전송된 카드 = 열람 기회를 얻은 것
    delivered    bigint,
    -- 아직 열리지 않고 큐에 남아 있는 것
    waiting      bigint,
    -- 소개 티켓을 써서 열린 카드
    opened       bigint,
    -- 전송됐지만 3주 안에 열리지 않아 사라진 것 = 헛돈 노동
    expired      bigint,
    -- 열린 카드의 결말
    passed       bigint,
    met          bigint,
    -- 열렸지만 아직 결말이 없는 것. 패스율의 분모에서 빼야 한다.
    undecided    bigint
  )
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  with waiting as (
    select q.curated_by,
           count(*)                                          as waiting,
           count(*) filter (where q.delivered_at is not null) as delivered
      from intro_queue q
     where q.opened_at is null
       and (p_since is null or q.created_at >= p_since)
     group by q.curated_by
  ),
  opened as (
    /*
      **intros 에서 센다.** 큐 행은 패스·만료로 사라지지만 소개는 남는다.
      curated_by 가 null 인 소개는 v1 시절 큐 없이 열린 것이라 제외된다.
    */
    select i.curated_by,
           count(*)                                                      as opened,
           count(*) filter (where i.outcome = 'passed')                   as passed,
           count(*) filter (where i.outcome = 'ticket_used')              as met,
           count(*) filter (where i.closed_at is null)                    as undecided
      from intros i
     where i.curated_by is not null
       and (p_since is null or i.opened_at >= p_since)
     group by i.curated_by
  ),
  gone as (
    select (e.props->>'curated_by')::uuid as curated_by, count(*) as expired
      from events e
     where e.name = 'intro_queue_expired'
       and e.props ? 'curated_by'
       and e.props->>'curated_by' is not null
       and (p_since is null or e.created_at >= p_since)
     group by 1
  )
  select c.id, c.name,
         coalesce(w.waiting, 0) + coalesce(o.opened, 0) + coalesce(g.expired, 0),
         -- 열린 것과 만료된 것은 반드시 전송을 거쳤다.
         coalesce(w.delivered, 0) + coalesce(o.opened, 0) + coalesce(g.expired, 0),
         coalesce(w.waiting, 0),
         coalesce(o.opened, 0),
         coalesce(g.expired, 0),
         coalesce(o.passed, 0),
         coalesce(o.met, 0),
         coalesce(o.undecided, 0)
    from profiles c
    left join waiting w on w.curated_by = c.id
    left join opened  o on o.curated_by = c.id
    left join gone    g on g.curated_by = c.id
   where c.role = 'admin'
     and (w.curated_by is not null or o.curated_by is not null or g.curated_by is not null)
   -- 많이 담은 사람부터. 표본이 큰 줄이 위로 온다.
   order by coalesce(w.waiting, 0) + coalesce(o.opened, 0) + coalesce(g.expired, 0) desc;
end $$;

comment on function admin_curator_stats(timestamptz) is
  '큐레이터별 퍼널. 비율은 화면이 계산한다 — 표본 크기를 감추면 오독한다.';

revoke all on function admin_curator_stats(timestamptz) from public, anon;
grant execute on function admin_curator_stats(timestamptz) to authenticated;
