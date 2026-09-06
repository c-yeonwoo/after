-- S31 — 취향 문답
--
-- ── 왜 만드는가 ──
--
-- 두 가지 문제가 하나로 만난다.
--
--   ① 기다리는 화면에 할 일이 없다. 남성이 로그인해서 소개가 아직 없으면
--      누를 것이 소개 받기 스위치 하나뿐이다. 며칠을 그 화면으로 버티게 하는
--      것은 무리다.
--   ② 사용자가 채운 **15개 항목 중 매칭에 쓰이는 것이 하나도 없다.** 큐레이션
--      화면은 두 프로필을 나란히 보여 주기는 하지만, 큐레이터가 눈으로 읽고
--      머리로 맞춰 본다. 대조할 축이 없다.
--
-- 양자택일 문답은 둘을 동시에 푼다. 기다리는 동안 할 일이 생기고, 그 답이
-- 곧 큐레이터가 쓰는 대조표가 된다.
--
-- ── 모으기만 하지 않는다 ──
--
-- 이 마이그레이션은 **쓰는 쪽까지 같이 만든다**(admin_preference_compare,
-- admin_like_pool 의 일치 수). 모으기만 하면 "이 답으로 소개가 달라집니다" 가
-- 거짓말이 되고, 그건 지금 15개 항목이 이미 빠져 있는 함정이다. 같은 함정을
-- 하나 더 파지 않는다.
--
-- ── 문항은 DB 에 두지 않는다 ──
--
-- 질문 문구는 코드(src/lib/preferences.ts)에 있고 여기에는 **번호만** 쌓인다.
-- 문구는 다듬을 일이 잦고(카피), 번호는 영영 바뀌면 안 된다(쌓인 답의 뜻이
-- 달라진다). 성격이 다른 두 값을 한곳에 두면 카피를 고칠 때마다 데이터
-- 마이그레이션을 하게 된다.
--
-- **은퇴한 문항의 번호는 재사용하지 않는다.** 재사용하면 옛 답이 새 질문의
-- 답으로 둔갑한다.

create table preference_answers (
  user_id     uuid     not null references profiles (id) on delete cascade,
  question_id smallint not null,
  -- 0 = 왼쪽 선택지, 1 = 오른쪽 선택지. 코드의 배열 순서와 같다.
  choice      smallint not null check (choice in (0, 1)),
  answered_at timestamptz not null default now(),

  primary key (user_id, question_id)
);

comment on table preference_answers is
  '취향 문답의 답. 문구는 코드에 있고 여기에는 번호만 쌓인다. 번호는 재사용하지 않는다.';

/* 큐레이터가 두 사람의 답을 맞춰 볼 때 문항 번호로 조인한다. */
create index on preference_answers (question_id);

alter table preference_answers enable row level security;

grant select, insert, update on preference_answers to authenticated;

/*
  본인 답만 읽는다. **상대의 답은 어떤 경로로도 보이지 않는다** — 서로의 취향을
  대조하는 일은 큐레이터의 몫이고, 사용자에게 열면 "나랑 몇 개 맞나" 를 보려고
  프로필을 뒤지는 화면이 된다. 이 제품이 피하려는 바로 그 행동이다.
*/
create policy preference_answers_select_own on preference_answers
  for select to authenticated using (user_id = auth.uid());

create policy preference_answers_insert_own on preference_answers
  for insert to authenticated with check (user_id = auth.uid());

/* 마음이 바뀌면 고칠 수 있다. 남의 답은 못 고친다. */
create policy preference_answers_update_own on preference_answers
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE 정책은 두지 않는다. 지울 이유가 없고, 탈퇴는 프로필 CASCADE 가 처리한다.

-- ═══════════════ 큐레이터가 쓰는 쪽 ═══════════════

/*
  두 사람이 **둘 다 답한** 문항만 세어 일치 수를 낸다.

  한쪽만 답한 문항을 "다름" 으로 세면 답을 적게 한 사람이 불리해지고, 그건
  성실함을 매칭 점수로 바꾸는 일이다. 우리가 재려는 것은 성실함이 아니라
  취향이 겹치는 정도다. 그래서 분모도 함께 돌려준다 — 3개 중 3개와 9개 중 7개는
  다른 신호이고, 화면이 그 차이를 말할 수 있어야 한다.
*/
create or replace function preference_agreement(p_a uuid, p_b uuid)
  returns table (answered_both integer, agree integer)
  language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer,
         count(*) filter (where a.choice = b.choice)::integer
    from preference_answers a
    join preference_answers b on b.question_id = a.question_id
   where a.user_id = p_a and b.user_id = p_b
$$;

comment on function preference_agreement(uuid, uuid) is
  '둘 다 답한 문항 수와 그중 일치 수. 한쪽만 답한 문항은 세지 않는다.';

/*
  내부 헬퍼다. 어떤 롤에도 EXECUTE 를 주지 않는다 — 이 함수는 임의의 두 사람의
  취향 겹침을 알려주므로, 사용자에게 열리면 위 SELECT 정책이 막아 둔 것을
  우회하는 통로가 된다.
*/
revoke all on function preference_agreement(uuid, uuid) from public, anon, authenticated;

/* 큐레이션 카드에서 문항별로 나란히 본다. */
create function admin_preference_compare(p_male uuid, p_female uuid)
  returns table (question_id smallint, male_choice smallint, female_choice smallint)
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select coalesce(m.question_id, f.question_id), m.choice, f.choice
    from (select * from preference_answers where user_id = p_male) m
    full join (select * from preference_answers where user_id = p_female) f
      on f.question_id = m.question_id
   order by 1;
end $$;

revoke all on function admin_preference_compare(uuid, uuid) from public, anon;
grant execute on function admin_preference_compare(uuid, uuid) to authenticated;

comment on function admin_preference_compare(uuid, uuid) is
  '두 사람의 취향 문답을 문항별로 나란히. 한쪽만 답한 문항도 나온다(null).';

-- ─────────── 후보 목록에 일치 수를 붙인다 ───────────

/*
  인자가 같으므로 create or replace 로 될 것 같지만, **반환 테이블의 컬럼이
  늘면 replace 가 거절된다**("cannot change return type of existing function").
  지우고 다시 만든다. 이 함정은 s19 주석이 세 번 겪었다고 적어 둔 것과 같은
  계열이다.
*/
drop function if exists admin_like_pool(uuid);

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
    waiting_hours integer,
    -- 취향 문답 (s31). 둘 다 답한 문항 수와 그중 일치 수.
    pref_both   integer,
    pref_agree  integer
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
         round(extract(epoch from (now() - a.created_at)) / 3600)::integer,
         pa.answered_both, pa.agree
    from affinities a
    join eligible_profiles p on p.id = a.from_id
    cross join lateral preference_agreement(p_male, a.from_id) pa
   where a.to_id = p_male
     and a.verdict = 'like'
     and p.gender = 'female'
     and not is_excluded(p_male, a.from_id)
     -- 이미 큐에 있거나 이미 소개된 사람은 풀에서 뺀다.
     and not exists (select 1 from intro_queue q
                      where q.male_id = p_male and q.female_id = a.from_id)
     and not exists (select 1 from intros i
                      where i.male_id = p_male and i.female_id = a.from_id)
   /*
     순서는 **오래 기다린 순 그대로** 둔다. 일치 수로 정렬하고 싶은 유혹이
     있지만, 그러면 답을 많이 한 사람이 위로 몰리고 적체가 늘어난다. 일치 수는
     큐레이터가 참고하는 값이지 순서를 정하는 값이 아니다. 순서를 바꾸려면
     그건 별도의 결정이어야 한다.
   */
   order by a.created_at;
end $$;

revoke all on function admin_like_pool(uuid) from public, anon;
grant execute on function admin_like_pool(uuid) to authenticated;

comment on function admin_like_pool(uuid) is
  '이 남성을 좋다고 한, 아직 큐에 없는 여성들. 오래 기다린 순. 취향 일치 수를 함께 낸다.';
