-- S12 — 홈 상태를 한 번에
--
-- 진단(PERF-3): 홈 한 번 로드에 REST 15회, 그중 profiles 가 9회였다.
-- S8·S10 이후 public_profiles 조회까지 붙어 재측정하니 **23회**(profiles 7 ·
-- public_profiles 5 · intros 5 · meetings 4 · no_show_reports 2)가 됐다.
-- 화면에 실제로 필요한 프로필은 나와 상대 둘뿐이다.
--
-- 원인 둘: (1) useMe() 가 화면마다 독립 구독을 걸고 onAuthStateChange 마다
-- 재조회한다 (2) 홈이 상태를 조각조각 물어본다 — 열린 소개, 그 만남, 확정된
-- 만남, 노쇼 신고, 후보를 각각.
-- (1)은 프론트에서 컨텍스트로 묶고, (2)는 이 함수가 받는다.
--
-- 읽기 전용이다. open_intro() 는 상태를 바꾸므로 여기 넣지 않는다 — 소개가
-- 없으면 호출자가 한 번 열고 다시 읽는다(평소엔 1회, 최초 1회만 2회).

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
    -- 상대는 그 만남의 상대다. 예전 프론트 로직은 candidate 를 다른 경로에서
    -- 채우고 meeting 만 덮어써서, 확정 카드에 엉뚱한 사람 이름이 붙을 수 있었다.
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

    -- 확정 만남이 있으면 위에서 정한 상대를 유지한다.
    if v_meeting.id is not null and v_meeting.confirmed_at is not null then
      select case when i.male_id = v_uid then i.female_id else i.male_id end
        into v_cand_id
        from intros i where i.id = v_meeting.intro_id;
    end if;
  else
    select count(*) into v_req_cnt
      from meetings m join intros i on i.id = m.intro_id
     where i.female_id = v_uid
       and i.closed_at is null
       and m.prefs_submitted_at is null
       and m.cancelled_at is null;

    if v_meeting.id is null then
      if v_req_cnt > 0 then
        -- 가장 오래 기다린 요청을 대표로. 환불 기한이 먼저 닥친다.
        -- record 와 스칼라를 한 INTO 에 섞을 수 없어 두 번 읽는다.
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

  return jsonb_build_object(
    'me',                   to_jsonb(v_me),
    'candidate',            v_cand,
    'meeting',              case when v_meeting.id is null then null else to_jsonb(v_meeting) end,
    'request_count',        v_req_cnt,
    'pending_no_show',      case when v_noshow.id is null then null else to_jsonb(v_noshow) end,
    'has_open_intro',       v_intro_id is not null
  );
end $$;

comment on function home_state is
  '홈이 필요한 상태 전부를 한 번에. 읽기 전용 — 소개 오픈은 open_intro() 가 따로 한다.';

revoke all on function home_state() from public, anon;
grant execute on function home_state() to authenticated;
