-- S53 — 프로필 사진 3장 이상 (2026-10-10)
--
-- 사진 한 장으로는 사람을 가늠하기 어렵고, 잘 나온 한 장만 고르는 일도 쉽다.
-- 이제 3~6장을 받는다. 순서가 있는 배열 하나(photo_paths)로 두고, 그 첫 장을
-- photo_url 로 맞춰 둔다 — 썸네일·운영자 화면·기존 함수는 photo_url 을 그대로 쓴다.
--
-- 검수는 **묶음 단위**다. 한 장이라도 바뀌면 묶음 전체가 다시 대기로 간다. 장마다
-- 따로 검수하면 "세 장 중 두 장만 승인" 같은 상태가 생기고, 그때 몇 장이 보여야
-- 하는지를 또 정해야 한다. 반려 사유 한 줄에 "세 번째 사진" 처럼 적으면 된다.
--
-- 자격은 승인된 3장 이상이다. 기존 회원(1장)은 사진을 더 올릴 때까지 소개 대상에서
-- 빠진다 — 베타 전이라 지금 묶는다. 홈이 그 사실을 알린다.

alter table profiles add column if not exists photo_paths text[];

alter table profiles drop constraint if exists profiles_photo_paths;
alter table profiles add constraint profiles_photo_paths check (
  photo_paths is null or (
    cardinality(photo_paths) <= 6
    -- s11 의 photo_url 규칙을 장마다 건다: Storage 경로만, data: URI 금지.
    and array_to_string(photo_paths, '|') !~ '(^|\|)data:'
    and char_length(array_to_string(photo_paths, '|')) <= 6 * 401
  )
);

comment on column profiles.photo_paths is
  'Storage 경로 3~6장(순서 = 보여 줄 순서). photo_url 은 첫 장으로 트리거가 맞춘다.';

-- 기존 한 장을 배열로 옮긴다. 트리거가 걸리기 전이라 검수 상태는 그대로다.
update profiles set photo_paths = array[photo_url]
 where photo_url is not null and photo_paths is null;

grant update (photo_paths) on profiles to authenticated;

-- ═══════════════════ 검수 되돌리기 (s18 확장) ═══════════════════

create or replace function reset_photo_review() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- 배열이 바뀌면 첫 장을 photo_url 로 맞춘다. 화면은 배열만 쓰면 된다.
  if new.photo_paths is distinct from old.photo_paths then
    new.photo_url := nullif(new.photo_paths[1], '');
  elsif new.photo_url is null and old.photo_url is not null then
    /*
      photo_url 만 비운 경우 = 탈퇴 파기(s29 withdraw_account) 같은 옛 경로다.
      묶음도 함께 비운다. 안 그러면 경로가 행에 남아 "파기했다" 가 거짓이 된다.
    */
    new.photo_paths := null;
  end if;

  if new.photo_url is distinct from old.photo_url
     or new.photo_paths is distinct from old.photo_paths then
    if new.photo_url is null then
      new.photo_state         := 'approved';
      new.photo_reject_reason := null;
    else
      new.photo_state         := 'pending';
      new.photo_reviewed_at   := null;
      new.photo_reviewed_by   := null;
      new.photo_reject_reason := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_photo_review on profiles;
create trigger profiles_photo_review
  before update of photo_url, photo_paths on profiles
  for each row execute function reset_photo_review();

-- ═══════════════════ 자격: 승인된 3장 이상 ═══════════════════

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
     and coalesce(cardinality(p.photo_paths), 0) >= 3
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
       and coalesce(cardinality(t.photo_paths), 0) >= 3
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
        photo_reject_reason, photo_paths
   from profiles
  where role = 'member'
    and email_verified_at is not null
    and account_state = 'active'
    and onboarding_step = 7
    and terms_agreed_at is not null
    and privacy_agreed_at is not null
    and paused_at is null
    and name is not null
    and coalesce(cardinality(photo_paths), 0) >= 3
    and photo_state = 'approved';

-- ═══════════════════ 상대에게 보이는 사진 묶음 ═══════════════════

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
  p.details,
  -- s53: 사진 여러 장. photo_url 은 그 첫 장이다. 뒤에 붙인다(앞에 넣으면 replace 가 거절된다).
  p.photo_paths
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
  );;

-- ═══════════════════ 운영자 검수 목록에 묶음을 싣는다 ═══════════════════

/* 반환 컬럼을 늘리면 replace 가 거절된다(s31 함정). */
drop function if exists admin_photo_queue(photo_state);
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
    reject_reason text,
    photo_paths   text[]
  )
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select p.id, p.name, p.gender, p.hub_id, p.photo_url, p.photo_state,
         p.account_state, p.onboarding_step, p.updated_at, p.photo_reject_reason,
         p.photo_paths
    from profiles p
   where p.photo_url is not null
     and p.photo_state = p_state
     and p.role <> 'admin'
   order by p.updated_at;
end $$;

revoke all on function admin_photo_queue(photo_state) from public, anon;
grant execute on function admin_photo_queue(photo_state) to authenticated;
