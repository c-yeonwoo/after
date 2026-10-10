-- S50 — 열기 전 공개 (D2 ①, 2026-10-10)
--
-- 진단: 남성은 상대에 대한 정보가 0개인 상태에서 소개 티켓(5,000원)을 쓰고, 넘기면 그
-- 돈은 사라졌다. 그 돈으로 회수하려는 운영자의 판단(누구를, 왜)은 남성 화면에 한 줄도
-- 나오지 않았다 — 사유는 필수 입력인데 감사 로그에만 남았다. 창업자는 5,000원·소멸
-- 구조를 유지하되 열기 전에 보여 주기로 했다.
--
-- 열기 전에 보이는 것: 나이 · 직업 · 한 줄 소개 · 두 사람이 같이 적은 주제 · 운영팀 한 줄.
-- 열기 전에 보이지 않는 것: 이름 · 사진 · 소개글. (열람의 값은 여기에 남는다.)
-- "먼저 관심을 보냈다" 는 쓰지 않는다 — 구조상 전제일 뿐 문구로 내세우지 않는다(D4).

-- ═══════════════════ 운영팀 한 줄 ═══════════════════

alter table intro_queue
  add column if not exists reason text
  check (reason is null or char_length(reason) <= 120);

comment on column intro_queue.reason is
  '남성에게 보이는 운영팀 한 줄(열기 전·후). note 는 감사용 사유로 따로 둔다.';

alter table intros add column if not exists reason text;
comment on column intros.reason is '열 때 intro_queue.reason 을 옮겨 적는다. 두 참여자가 읽는다.';

-- ═══════════════════ 열 수 있는 맨 앞 카드 ═══════════════════

/*
  open_intro 와 intro_teaser 가 **같은 카드**를 봐야 한다. 티저는 A 를 보여 주고 열면
  B 가 열리면 돈을 받고 다른 사람을 준 셈이다. 그래서 고르는 규칙을 한 함수에 둔다.
  setof 로 둔다 — 스칼라 복합형은 "없음" 을 전 컬럼 NULL 인 한 행으로 돌려준다(s30 함정).
*/
create or replace function next_openable_card(p_male uuid) returns setof intro_queue
  language sql stable security definer set search_path = public, pg_temp as $$
  select q.* from intro_queue q
   where q.male_id = p_male
     and q.opened_at is null
     and q.delivered_at is not null
     and q.expires_at > now()
     and not is_excluded(p_male, q.female_id)
     and exists (select 1 from eligible_profiles e
                  where e.id = q.female_id and e.gender = 'female')
   order by q.position, q.created_at
   limit 1
$$;

revoke all on function next_openable_card(uuid) from public, anon, authenticated;

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

  select q.* into v_card from intro_queue q
   where q.id = (select id from next_openable_card(v_uid))
   for update skip locked;
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

  insert into intros (male_id, female_id, curated_by, reason)
  values (v_uid, v_card.female_id, v_card.curated_by, v_card.reason)
  returning * into v_intro;

  update tickets
     set state = 'used', used_at = now(), intro_id = v_intro.id
   where id = v_ticket.id;

  update intro_queue set opened_at = now() where id = v_card.id;
  perform promote_intro_queue(v_uid);

  insert into events (user_id, name, props)
  values (v_uid, 'intro_opened',
          jsonb_build_object('intro_id', v_intro.id, 'ticket_id', v_ticket.id,
                             'curated_by', v_card.curated_by,
                             'had_reason', v_card.reason is not null));
  return v_intro;
end $$;

-- ═══════════════════ 티저 ═══════════════════

/*
  겹치는 주제는 두 사람이 **직접 고른 값 그대로**의 교집합이다. 점수도 퍼센트도
  만들지 않는다. 대화 주제는 칩이라 정확히 겹치고, 관심사는 자유 입력이라 같은
  말을 쓴 경우에만 겹친다.
*/
create or replace function intro_teaser()
  returns table(age integer, job text, headline text, shared text[], reason text,
                delivered integer)
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_card intro_queue;
  v_her  profiles;
  v_me   profiles;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if my_gender() <> 'male' then
    raise exception 'only male users receive introductions' using errcode = '42501';
  end if;

  select * into v_card from next_openable_card(v_uid);
  if not found then
    return;
  end if;

  select * into v_her from profiles where id = v_card.female_id;
  select * into v_me  from profiles where id = v_uid;

  return query
  select
    case when v_her.birth is null then null
         else date_part('year', age(current_date, v_her.birth))::integer end,
    v_her.job,
    v_her.headline,
    array(
      select distinct t from (
        select unnest(coalesce(v_her.topics, '{}'))    as t
        intersect
        select unnest(coalesce(v_me.topics, '{}'))
        union
        select unnest(coalesce(v_her.interests, '{}'))
        intersect
        select unnest(coalesce(v_me.interests, '{}'))
      ) s order by t
    ),
    v_card.reason,
    (select count(*)::integer from intro_queue q
      where q.male_id = v_uid and q.opened_at is null
        and q.delivered_at is not null and q.expires_at > now());
end $$;

revoke all on function intro_teaser() from public, anon;
grant execute on function intro_teaser() to authenticated;

-- ═══════════════════ 운영자: 카드별 한 줄 ═══════════════════

alter table admin_actions drop constraint if exists admin_actions_kind_check;
alter table admin_actions add constraint admin_actions_kind_check check (kind = any (array[
  'resolve_report', 'ban', 'unban', 'refund', 'cancel_meeting', 'review_photo', 'set_queue',
  'resolve_no_show', 'set_payments', 'fulfill_order', 'reset_photo', 'retry_notification',
  'set_queue_reason'
]));

create or replace function admin_set_queue_reason(p_male uuid, p_female uuid, p_reason text)
  returns intro_queue
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_card intro_queue;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  update intro_queue
     set reason = nullif(btrim(p_reason), '')
   where male_id = p_male and female_id = p_female and opened_at is null
  returning * into v_card;
  if not found then
    raise exception 'queue card not found' using errcode = 'P0002';
  end if;

  insert into admin_actions (actor_id, kind, target_user, target_ref, note)
  values (auth.uid(), 'set_queue_reason', p_male, p_female,
          coalesce(v_card.reason, '(지움)'));
  return v_card;
end $$;

revoke all on function admin_set_queue_reason(uuid, uuid, text) from public, anon;
grant execute on function admin_set_queue_reason(uuid, uuid, text) to authenticated;

/* 운영자 큐 조회에 reason 을 더한다. 반환 컬럼을 늘리면 replace 가 거절된다(s31 함정). */
drop function if exists admin_queue(uuid);
create function admin_queue(p_male uuid)
  returns table(female_id uuid, queue_position integer, name text, photo_url text,
                photo_state photo_state, birth date, job text, mbti text, smoking text,
                drinking text, religion text, hub_id text, headline text, intro text,
                interests text[], match_tags text[], topics text[], details jsonb,
                delivered_at timestamptz, expires_at timestamptz, note text,
                curator_name text, reason text)
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select q.female_id, q.position, p.name, p.photo_url, p.photo_state, p.birth, p.job,
         p.mbti, p.smoking, p.drinking, p.religion, p.hub_id, p.headline, p.intro,
         p.interests, p.match_tags, p.topics, p.details,
         q.delivered_at, q.expires_at, q.note, c.name, q.reason
    from intro_queue q
    join profiles p on p.id = q.female_id
    left join profiles c on c.id = q.curated_by
   where q.male_id = p_male and q.opened_at is null
   order by q.position, q.created_at;
end $$;

revoke all on function admin_queue(uuid) from public, anon;
grant execute on function admin_queue(uuid) to authenticated;
