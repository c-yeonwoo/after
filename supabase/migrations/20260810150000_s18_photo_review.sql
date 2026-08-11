-- S18 — 프로필 사진 검수
--
-- 지금은 올린 사진이 그대로 상대에게 보인다. 부적절한 사진을 사후에 신고로만
-- 걸러낼 수 있고, 그 사이에 이미 노출된다.
--
-- **검수 전에는 후보 풀에서 제외한다.** 사진만 가리고 프로필은 노출하는 방식도
-- 있었지만, 사진 없는 후보가 돌아다니면 그것도 상품이 아니다.
--
-- 대가를 분명히 적어 둔다: 사진을 올리거나 **바꾸면** 검수까지 후보 풀에서
-- 빠진다. 운영자가 밀리면 그만큼 아무도 그 사람을 못 본다. 그래서 §대시보드에
-- 검수 대기 수를 적체 지표로 넣는다 — 안 보이면 관리할 방법이 없다.

create type photo_state as enum ('pending', 'approved', 'rejected');

alter table profiles
  add column photo_state         photo_state not null default 'pending',
  add column photo_reviewed_at   timestamptz,
  add column photo_reviewed_by   uuid references profiles(id),
  add column photo_reject_reason text;

/*
  기존 행은 전부 승인으로 둔다. default 를 그대로 적용하면 배포 순간 모든 회원이
  후보 풀에서 사라진다 — 이미 노출되던 사진을 소급해 감추는 것은 검수 도입의
  목적이 아니다.
*/
update profiles set photo_state = 'approved', photo_reviewed_at = now();

comment on column profiles.photo_state is
  '사진 검수 상태. approved 가 아니면 후보 풀에서 빠진다(사진이 없으면 무관).';

/*
  사진이 바뀌면 다시 검수한다. 한 번 통과한 계정이 다른 사진으로 갈아치우는
  경로를 막지 않으면 검수가 형식이 된다.

  사진을 지우면(null) 검수할 것이 없다 — approved 로 되돌려 'pending 인데
  사진이 없는' 상태가 남지 않게 한다. 노출 게이트는 어차피 photo_url is null 을
  먼저 통과시킨다.

  컬럼 권한상 authenticated 는 photo_state 를 쓸 수 없다(photo_url 만 가능).
  값을 바꾸는 주체는 이 트리거와 운영자 RPC 뿐이다.
*/
create or replace function reset_photo_review() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.photo_url is distinct from old.photo_url then
    if new.photo_url is null then
      new.photo_state        := 'approved';
      new.photo_reject_reason := null;
    else
      new.photo_state        := 'pending';
      new.photo_reviewed_at  := null;
      new.photo_reviewed_by  := null;
      new.photo_reject_reason := null;
    end if;
  end if;
  return new;
end $$;

create trigger profiles_photo_review
  before update of photo_url on profiles
  for each row execute function reset_photo_review();

-- ─────────────────── 노출 게이트 두 곳 ───────────────────

/*
  게이트가 두 곳이다 — 뷰와 함수. s14 주석이 이미 경고하고 있다:
  "뷰를 쓰지 않는 경로들도 함께 고친다. 빠뜨리면 쉬는 중인 사람이 계속 노출된다."

  사진이 없는 회원은 통과시킨다. 사진은 온보딩 필수가 아니어서(basicsValid 가
  검사하지 않는다) 여기서 막으면 검수와 무관하게 사진 없는 회원 전체가 사라진다.
*/
drop view if exists eligible_profiles;

create view eligible_profiles with (security_invoker = true) as
  select * from profiles
   where email_verified_at is not null
     and account_state = 'active'
     and onboarding_step = 7
     and terms_agreed_at is not null
     and privacy_agreed_at is not null
     and paused_at is null
     and (photo_url is null or photo_state = 'approved');

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
       and (t.photo_url is null or t.photo_state = 'approved')
       and t.hub_id            = my_hub_id()
  )
$$;

-- ─────────────────── 운영자 검수 ───────────────────

-- 개입 종류를 하나 늘린다. CHECK 로 묶어 둔 어휘라 함께 고쳐야 한다.
alter table admin_actions drop constraint if exists admin_actions_kind_check;
alter table admin_actions add constraint admin_actions_kind_check check (
  kind in ('resolve_report', 'ban', 'unban', 'refund', 'cancel_meeting', 'review_photo')
);

/*
  검수 대기 목록. 사진 경로를 함께 낸다 — 화면이 서명 URL 을 만들려면 경로가
  필요하고, s17 이 붙인 운영자 Storage 정책으로 읽을 수 있다.

  반려된 것도 함께 볼 수 있게 상태를 인자로 받는다. 반려 후 사용자가 다시 올리면
  트리거가 pending 으로 돌리므로, 반려 목록은 "다시 올리지 않은 사람" 이 된다.
*/
create function admin_photo_queue(p_state photo_state default 'pending')
  returns table (
    id            uuid,
    name          text,
    gender        gender,
    hub_id        text,
    photo_url     text,
    photo_state   photo_state,
    account_state account_state,
    onboarding_step smallint,
    updated_at    timestamptz,
    reject_reason text
  )
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select p.id, p.name, p.gender, p.hub_id, p.photo_url, p.photo_state,
         p.account_state, p.onboarding_step, p.updated_at, p.photo_reject_reason
    from profiles p
   where p.photo_url is not null
     and p.photo_state = p_state
     and p.role <> 'admin'
   -- 오래 기다린 사람부터. 검수는 선착순이 공정하고, 적체도 그렇게 줄어든다.
   order by p.updated_at;
end $$;

comment on function admin_photo_queue(photo_state) is
  '사진 검수 대기 목록. 오래 기다린 순 — 검수는 선착순이 공정하다.';

/*
  승인·반려. 반려하면 사유가 사용자에게 보여야 하므로 profiles 에 남긴다
  (photo_reject_reason). 운영자 기록은 늘 그렇듯 admin_actions 에도 남는다.
*/
create function admin_review_photo(p_user uuid, p_approve boolean, p_note text)
  returns profiles
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_profile profiles;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  -- 반려는 사유가 사용자에게 보이므로 반드시 받는다. 승인도 기록을 위해 받는다.
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'note required' using errcode = '22023';
  end if;

  update profiles
     set photo_state         = (case when p_approve then 'approved' else 'rejected' end)::photo_state,
         photo_reviewed_at   = now(),
         photo_reviewed_by   = v_uid,
         photo_reject_reason = case when p_approve then null else p_note end
   where id = p_user
     and photo_url is not null
     and photo_state = 'pending'
  returning * into v_profile;
  if not found then
    -- 이미 다른 운영자가 봤거나 사진이 지워졌다. 정상적인 경합이므로 409.
    raise exception 'photo not pending' using errcode = 'PT409';
  end if;

  insert into admin_actions (actor_id, kind, target_user, target_ref, note)
  values (v_uid, 'review_photo', p_user, null,
          (case when p_approve then '승인 — ' else '반려 — ' end) || p_note);

  return v_profile;
end $$;

comment on function admin_review_photo(uuid, boolean, text) is
  '사진 승인·반려. 반려 사유는 사용자에게 보인다. 이미 처리된 건은 409.';

-- ─────────────────── 대시보드에 검수 적체 ───────────────────

/*
  검수 대기를 적체 지표에 넣는다. "검수 전 제외" 를 택한 대가가 여기 보인다 —
  이 숫자가 쌓이면 그만큼의 회원이 아무에게도 보이지 않는다.
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
      'completed',        (select count(*) from meetings where completed_at is not null)
    ),

    'backlog', jsonb_build_object(
      'pending_reports',   (select count(*) from content_reports where state = 'pending'),
      'pending_no_shows',  (select count(*) from no_show_reports where state = 'pending'),
      -- 사진 검수 대기 = 지금 아무에게도 보이지 않는 회원 수
      'pending_photos',    (select count(*) from profiles
                             where photo_url is not null and photo_state = 'pending'
                               and role <> 'admin'),
      'unmatched_likes',   (select count(*) from affinities a
                             where a.verdict = 'like'
                               and not exists (select 1 from intros i
                                                where i.male_id = a.to_id
                                                  and i.female_id = a.from_id)),
      'oldest_like_hours', (select round(extract(epoch from (now() - min(a.created_at))) / 3600)
                              from affinities a
                             where a.verdict = 'like'
                               and not exists (select 1 from intros i
                                                where i.male_id = a.to_id
                                                  and i.female_id = a.from_id))
    ),

    'quality', jsonb_build_object(
      'intros_total',  (select count(*) from intros),
      'intros_passed', (select count(*) from intros where outcome = 'passed'),
      'intros_used',   (select count(*) from intros where outcome = 'ticket_used')
    )
  ) into v;

  return v;
end $$;

comment on function admin_dashboard() is
  '운영자 대시보드 한 번에. 적체·품질을 규모보다 먼저 본다. 규모에서 운영자는 뺀다.';

-- ─────────────────── 권한 ───────────────────

revoke all on function admin_photo_queue(photo_state)          from public, anon;
revoke all on function admin_review_photo(uuid, boolean, text)  from public, anon;
grant execute on function admin_photo_queue(photo_state)         to authenticated;
grant execute on function admin_review_photo(uuid, boolean, text) to authenticated;
