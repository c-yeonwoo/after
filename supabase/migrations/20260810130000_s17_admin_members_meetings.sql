-- S17 — 운영 콘솔: 회원 · 만남
--
-- s16 은 "볼 수 있게" 만들었고 여기서 "만질 수 있게" 만든다. 운영자가 개입할
-- 지점은 docs/admin-design.md §4 의 3단계에 해당한다.
--
-- 원칙은 s16 과 같다: 필요한 모양 그대로 서버에서 만들어 내보낸다. 화면에서
-- 조인해 세려면 profiles·tickets·meetings 를 운영자에게 넓게 열어야 하고,
-- 넓힌 정책은 결국 사용자 쪽에서도 열린다.

-- ─────────────────── 운영자는 모든 사진을 본다 ───────────────────

/*
  기존 읽기 정책(photos_select_visible)은 public_profiles 로 보이는 사람만
  허용한다. 그 뷰는 "본인 · 소개가 열린 상대 · 진행 중 만남 상대 · (여성이 보는)
  후보 남성" 이어서, 운영자에게는 **자기 사진 하나만** 보인다.

  회원 상세에서 사진을 확인할 수 없다는 뜻이고, 사진 검수(다음 단계)는 아예
  불가능하다. 운영자용 정책을 따로 붙인다 — 기존 정책을 넓히면 사용자 쪽
  가시성 규칙이 흔들린다.
*/
create policy photos_select_admin on storage.objects
  for select to authenticated using (
    bucket_id = 'profile-photos' and is_admin()
  );

-- ─────────────────── 회원 목록 ───────────────────

/*
  목록에 필요한 집계를 함께 낸다. 화면에서 회원 수만큼 티켓·만남·신고를 다시
  조회하면 N+1 이 되고, 그러려면 그 테이블들을 운영자에게 열어야 한다.

  p_query 는 이름·회사메일 부분일치. 운영자가 CS 를 받을 때 가진 단서가
  대개 그 둘이다.
*/
create function admin_members(
  p_gender gender         default null,
  p_state  account_state  default null,
  p_hub    text           default null,
  p_query  text           default null
) returns table (
  id                     uuid,
  name                   text,
  gender                 gender,
  hub_id                 text,
  company_email          text,
  account_state          account_state,
  role                   text,
  onboarding_step        smallint,
  paused_at              timestamptz,
  photo_url              text,
  created_at             timestamptz,
  unused_tickets         bigint,
  has_active_meeting     boolean,
  pending_reports_against bigint
)
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select p.id, p.name, p.gender, p.hub_id, p.company_email,
         p.account_state, p.role, p.onboarding_step, p.paused_at,
         p.photo_url, p.created_at,
         (select count(*) from tickets t
           where t.user_id = p.id and t.state = 'unused'),
         exists (select 1 from meetings m
                   join intros i on i.id = m.intro_id
                  where m.cancelled_at is null and m.completed_at is null
                    and (i.male_id = p.id or i.female_id = p.id)),
         (select count(*) from content_reports r
           where r.accused_id = p.id and r.state = 'pending')
    from profiles p
   where (p_gender is null or p.gender        = p_gender)
     and (p_state  is null or p.account_state = p_state)
     and (p_hub    is null or p.hub_id        = p_hub)
     and (p_query  is null or btrim(p_query) = ''
          or p.name          ilike '%' || btrim(p_query) || '%'
          or p.company_email ilike '%' || btrim(p_query) || '%')
   order by p.created_at desc;
end $$;

comment on function admin_members(gender, account_state, text, text) is
  '운영자 회원 목록. 티켓·만남·미처리 신고 수를 함께 낸다(화면 N+1 방지).';

-- ─────────────────── 회원 상세 ───────────────────

/*
  jsonb 한 덩이로 낸다. 프로필·티켓·만남·신고·개입기록이 한 화면에 같이 떠야
  하는데, 이걸 다섯 번 왕복하면 그만큼의 테이블을 운영자에게 열어야 한다.

  프로필은 컬럼을 나열하지 않고 to_jsonb 로 통째로 낸다 — 운영자는 사용자에게
  보이지 않는 값(company_email·onboarding_step·banned_reason 등)까지 봐야
  하고, 컬럼이 늘 때마다 이 함수를 고치게 만들 이유가 없다.
*/
create function admin_member_detail(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(p),

    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'kind', 'meeting', 'state', t.state,
               'price_krw', t.price_krw, 'issued_at', t.issued_at,
               'used_at', t.used_at, 'refunded_at', t.refunded_at)
             order by t.issued_at desc)
        from tickets t where t.user_id = p.id), '[]'::jsonb),

    'meetings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'counterpart', case when i.male_id = p.id then f.name else mp.name end,
               'counterpart_id', case when i.male_id = p.id then i.female_id else i.male_id end,
               'role', case when i.male_id = p.id then 'male' else 'female' end,
               'scheduled_at', m.scheduled_at, 'place_name', m.place_name,
               'confirmed_at', m.confirmed_at, 'completed_at', m.completed_at,
               'cancelled_at', m.cancelled_at, 'cancel_reason', m.cancel_reason,
               'created_at', m.created_at)
             order by m.created_at desc)
        from meetings m
        join intros i  on i.id = m.intro_id
        join profiles mp on mp.id = i.male_id
        join profiles f  on f.id  = i.female_id
       where i.male_id = p.id or i.female_id = p.id), '[]'::jsonb),

    -- 신고는 양방향 다 본다. "이 사람이 자주 신고당하나" 와 "자주 신고하나" 가
    -- 둘 다 판단 재료다.
    'reports_against', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'kind', r.kind, 'state', r.state,
               'detail', r.detail, 'created_at', r.created_at,
               'reporter_name', rp.name)
             order by r.created_at desc)
        from content_reports r join profiles rp on rp.id = r.reporter_id
       where r.accused_id = p.id), '[]'::jsonb),

    'reports_filed', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'kind', r.kind, 'state', r.state,
               'detail', r.detail, 'created_at', r.created_at,
               'accused_name', ap.name)
             order by r.created_at desc)
        from content_reports r join profiles ap on ap.id = r.accused_id
       where r.reporter_id = p.id), '[]'::jsonb),

    -- 이 회원에게 무슨 짓을 했는지. 정지 사유를 화면에서 볼 수 있어야
    -- note 를 필수로 받은 의미가 산다(s16c 에서 같은 이유로 고쳤다).
    'admin_actions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', a.kind, 'note', a.note, 'created_at', a.created_at,
               'actor_name', actor.name)
             order by a.created_at desc)
        from admin_actions a join profiles actor on actor.id = a.actor_id
       where a.target_user = p.id), '[]'::jsonb)
  ) into v
  from profiles p where p.id = p_user;

  if v is null then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  return v;
end $$;

comment on function admin_member_detail(uuid) is
  '회원 상세 한 번에. 프로필 전체 + 티켓 · 만남 · 신고(양방향) · 개입기록.';

-- ─────────────────── 정지 · 해제 ───────────────────

/*
  정지하면 **진행 중인 만남을 끊는다.** 정지된 사람과의 약속을 남겨두면 상대는
  오지 않을 사람을 기다린다.

  환불 규칙이 까다롭다. 티켓은 항상 남성이 냈으므로,

    · 정지 대상이 남성이면  → 환불하지 않는다 (본인 사유)
    · 정지 대상이 여성이면  → 남성에게 환불한다 (그는 잘못이 없다)

  "정지했으니 전부 환불" 로 뭉개면 위반자에게 돈을 돌려주게 되고, "정지에는
  환불 없음" 으로 뭉개면 무고한 상대가 3만원을 잃는다. 티켓 소유자가
  정지 대상인지로 가른다.
*/
create function admin_set_account_state(
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
         and (i.male_id = p_user or i.female_id = p_user)
    loop
      update meetings set cancelled_at = now(), cancel_reason = 'admin_banned'
       where id = r.meeting_id;
      update intros set closed_at = now(), outcome = 'withdrawn'
       where id = r.intro_id and closed_at is null;

      -- 티켓 주인이 정지 대상이 아닐 때만 돌려준다.
      if r.ticket_owner is distinct from p_user then
        insert into admin_actions (actor_id, kind, target_user, target_ref, note)
        values (v_uid, 'refund', r.ticket_owner, r.ticket_id,
                '상대 정지로 만남 취소 — ' || p_note);
        perform refund_ticket(r.ticket_id, 'counterpart_banned');
      end if;

      insert into admin_actions (actor_id, kind, target_user, target_ref, note)
      values (v_uid, 'cancel_meeting', p_user, r.meeting_id, '정지 처리 — ' || p_note);
    end loop;
  end if;

  insert into admin_actions (actor_id, kind, target_user, target_ref, note)
  values (v_uid, case when p_state = 'banned' then 'ban' else 'unban' end,
          p_user, null, p_note);

  return v_profile;
end $$;

comment on function admin_set_account_state(uuid, account_state, text) is
  '회원 정지·해제. 정지 시 진행 중 만남을 끊고, 티켓 주인이 위반자가 아니면 환불한다.';

-- ─────────────────── 만남 목록 ───────────────────

create function admin_meetings(p_state text default null)
  returns table (
    id                 uuid,
    male_id            uuid,
    male_name          text,
    female_id          uuid,
    female_name        text,
    ticket_id          uuid,
    ticket_state       ticket_state,
    prefs_submitted_at timestamptz,
    scheduled_at       timestamptz,
    place_name         text,
    confirmed_at       timestamptz,
    completed_at       timestamptz,
    cancelled_at       timestamptz,
    cancel_reason      text,
    created_at         timestamptz
  )
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_state is not null
     and p_state not in ('active', 'confirmed', 'completed', 'cancelled') then
    raise exception 'unknown state filter' using errcode = '22023';
  end if;

  return query
  select m.id, i.male_id, mp.name, i.female_id, f.name,
         m.ticket_id, t.state,
         m.prefs_submitted_at, m.scheduled_at, m.place_name,
         m.confirmed_at, m.completed_at, m.cancelled_at, m.cancel_reason,
         m.created_at
    from meetings m
    join intros   i  on i.id  = m.intro_id
    join profiles mp on mp.id = i.male_id
    join profiles f  on f.id  = i.female_id
    join tickets  t  on t.id  = m.ticket_id
   where p_state is null
      or (p_state = 'active'    and m.cancelled_at is null and m.completed_at is null)
      or (p_state = 'confirmed' and m.confirmed_at is not null
                                and m.cancelled_at is null and m.completed_at is null)
      or (p_state = 'completed' and m.completed_at is not null)
      or (p_state = 'cancelled' and m.cancelled_at is not null)
   -- 진행 중을 위에 둔다. 운영자가 손댈 수 있는 건 그것뿐이다.
   order by (m.cancelled_at is null and m.completed_at is null) desc,
            m.created_at desc;
end $$;

comment on function admin_meetings(text) is
  '만남 목록. 진행 중을 항상 위에 둔다 — 개입 가능한 대상이 그것뿐이다.';

-- ─────────────────── 만남 강제 취소 ───────────────────

/*
  환불 여부를 운영자가 고른다. 자동으로 정하지 않는다 — 취소 사유가
  "장소 착오" 인지 "한쪽 잘못" 인지는 사람만 안다.

  이미 환불된 티켓(자동 만료 등)에 또 요청이 오면 refund_ticket 이 P0002 로
  터져 취소 전체가 롤백된다. 그러면 "환불은 이미 됐는데 취소가 안 되는" 건이
  영원히 남는다 — state 를 먼저 확인해서 건너뛴다.
*/
create function admin_cancel_meeting(
  p_meeting uuid,
  p_note    text,
  p_refund  boolean default true
) returns meetings
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_meeting meetings;
  v_owner   uuid;
  v_state   ticket_state;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'note required' using errcode = '22023';
  end if;

  update meetings
     set cancelled_at = now(), cancel_reason = 'admin_cancelled'
   where id = p_meeting and cancelled_at is null and completed_at is null
  returning * into v_meeting;
  if not found then
    -- 이미 취소·완료된 건이다. 정상적인 경합이므로 409 로 낸다(s16c 와 같은 규약).
    raise exception 'meeting not cancellable' using errcode = 'PT409';
  end if;

  update intros set closed_at = now(), outcome = 'withdrawn'
   where id = v_meeting.intro_id and closed_at is null;

  if p_refund then
    select t.user_id, t.state into v_owner, v_state
      from tickets t where t.id = v_meeting.ticket_id;
    if v_state <> 'refunded' then
      insert into admin_actions (actor_id, kind, target_user, target_ref, note)
      values (v_uid, 'refund', v_owner, v_meeting.ticket_id, p_note);
      perform refund_ticket(v_meeting.ticket_id, 'admin_cancelled');
    end if;
  end if;

  insert into admin_actions (actor_id, kind, target_user, target_ref, note)
  values (v_uid, 'cancel_meeting', null, p_meeting, p_note);

  return v_meeting;
end $$;

comment on function admin_cancel_meeting(uuid, text, boolean) is
  '만남 강제 취소. 환불은 운영자가 고른다. 이미 취소된 건은 409.';

-- ─────────────────── EXECUTE 권한 ───────────────────

revoke all on function admin_members(gender, account_state, text, text)   from public, anon;
revoke all on function admin_member_detail(uuid)                          from public, anon;
revoke all on function admin_set_account_state(uuid, account_state, text)  from public, anon;
revoke all on function admin_meetings(text)                               from public, anon;
revoke all on function admin_cancel_meeting(uuid, text, boolean)          from public, anon;

grant execute on function admin_members(gender, account_state, text, text)   to authenticated;
grant execute on function admin_member_detail(uuid)                          to authenticated;
grant execute on function admin_set_account_state(uuid, account_state, text)  to authenticated;
grant execute on function admin_meetings(text)                               to authenticated;
grant execute on function admin_cancel_meeting(uuid, text, boolean)          to authenticated;
