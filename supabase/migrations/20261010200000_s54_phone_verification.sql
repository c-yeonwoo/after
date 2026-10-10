-- S54 — 휴대폰 인증 (2026-10-10)
--
-- 회사 메일 인증 다음에 휴대폰 번호를 한 번 더 확인한다. 목적은 **번호 하나에 계정
-- 하나**다. 회사 메일은 퇴사·이직으로 새로 생기고, 탈퇴 후 다른 메일로 다시 오거나
-- 정지된 사람이 돌아오는 걸 막지 못한다.
--
-- 문자는 솔라피로 보낸다(Edge Function phone-otp). 코드는 여기서 만들고 **해시만**
-- 남긴다. 확인은 회원이 verify_phone_code 를 직접 부른다.
--
-- 탈퇴하면 번호를 지운다(파기). 정지된 계정은 행과 번호가 남으므로 같은 번호로
-- 다시 가입할 수 없다 — 유니크 인덱스가 그 일을 한다.

alter table profiles add column if not exists phone text
  check (phone is null or phone ~ '^\+82[0-9]{9,10}$');
alter table profiles add column if not exists phone_verified_at timestamptz;

comment on column profiles.phone is '인증된 휴대폰 번호(E.164, +82…). 상대에게 노출하지 않는다.';

create unique index if not exists profiles_phone_unique on profiles (phone) where phone is not null;

-- 회원이 직접 쓰지 못한다. verify_phone_code 만 쓴다(컬럼 grant 를 주지 않는다).

-- ═══════════════════ 인증 코드 ═══════════════════

create table if not exists phone_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  phone       text not null,
  code_hash   text not null,
  attempts    smallint not null default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists phone_codes_user on phone_codes (user_id, created_at desc);
create index if not exists phone_codes_phone on phone_codes (phone, created_at desc);

alter table phone_codes enable row level security;
revoke all on phone_codes from public, anon, authenticated;

create or replace function phone_code_hash(p_user uuid, p_code text) returns text
  language sql immutable set search_path = public, extensions, pg_temp as $$
  select encode(extensions.digest(p_user::text || ':' || p_code, 'sha256'), 'hex')
$$;
revoke all on function phone_code_hash(uuid, text) from public, anon, authenticated;

/*
  코드를 만든다. **Edge Function(service_role)만 부른다** — 코드 원문을 돌려주기
  때문이다. 회원이 부를 수 있으면 문자 없이 인증이 끝난다.

  막는 것:
    · 이미 다른 계정이 인증한 번호
    · 같은 사람에게 60초 안에 재발송, 하루 5회 초과
    · 같은 번호로 하루 10회 초과(남의 번호로 문자 폭탄)
*/
create or replace function issue_phone_code(p_user uuid, p_phone text) returns text
  language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_code text;
begin
  if p_phone !~ '^\+82[0-9]{9,10}$' then
    raise exception 'invalid phone' using errcode = '22023';
  end if;
  if exists (select 1 from profiles where phone = p_phone and id <> p_user) then
    raise exception 'phone in use' using errcode = '23505';
  end if;
  if exists (select 1 from phone_codes
              where user_id = p_user and created_at > now() - interval '60 seconds') then
    raise exception 'too soon' using errcode = 'P0001';
  end if;
  if (select count(*) from phone_codes
       where user_id = p_user and created_at > now() - interval '1 day') >= 5
     or (select count(*) from phone_codes
          where phone = p_phone and created_at > now() - interval '1 day') >= 10 then
    raise exception 'daily limit' using errcode = 'P0001';
  end if;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into phone_codes (user_id, phone, code_hash, expires_at)
  values (p_user, p_phone, phone_code_hash(p_user, v_code), now() + interval '3 minutes');
  return v_code;
end $$;

revoke all on function issue_phone_code(uuid, text) from public, anon, authenticated;
-- public 을 거두면 service_role 도 함께 잃는다. Edge Function 이 부를 수 있게 따로 준다.
grant execute on function issue_phone_code(uuid, text) to service_role;

/*
  회원이 받은 코드를 확인한다. 가장 최근 코드만 유효하다 — 예전 코드가 살아 있으면
  다시 받기를 누를수록 맞힐 확률이 올라간다. 틀린 횟수 5회면 그 코드는 끝난다.
*/
create or replace function verify_phone_code(p_phone text, p_code text) returns profiles
  language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_row  phone_codes;
  v_me   profiles;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select * into v_row from phone_codes
   where user_id = v_uid
   order by created_at desc
   limit 1
   for update;
  if not found or v_row.phone <> p_phone or v_row.consumed_at is not null
     or v_row.expires_at <= now() or v_row.attempts >= 5 then
    raise exception 'code expired' using errcode = 'P0002';
  end if;

  if v_row.code_hash <> phone_code_hash(v_uid, btrim(coalesce(p_code, ''))) then
    update phone_codes set attempts = attempts + 1 where id = v_row.id;
    raise exception 'wrong code' using errcode = '22023';
  end if;

  update phone_codes set consumed_at = now() where id = v_row.id;
  begin
    update profiles set phone = p_phone, phone_verified_at = now()
     where id = v_uid
    returning * into v_me;
  exception when unique_violation then
    raise exception 'phone in use' using errcode = '23505';
  end;

  insert into events (user_id, name, props) values (v_uid, 'phone_verified', '{}'::jsonb);
  return v_me;
end $$;

revoke all on function verify_phone_code(text, text) from public, anon;
grant execute on function verify_phone_code(text, text) to authenticated;

-- ═══════════════════ 탈퇴 파기 ═══════════════════

/*
  탈퇴(s29 withdraw_account)는 신원 컬럼을 하나씩 비운다. 그 뒤에 생긴 컬럼은 그
  목록에 없다 — 인터뷰 답(s52)과 번호(s54)가 남는다. 함수를 다시 쓰는 대신
  account_state 가 withdrawn 이 되는 순간 여기서 비운다. 다음에 컬럼이 늘면 여기에
  더한다.
*/
create or replace function erase_on_withdraw() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.account_state = 'withdrawn' and old.account_state is distinct from 'withdrawn' then
    new.phone             := null;
    new.phone_verified_at := null;
    new.evening_note      := null;
    new.known_as          := null;
  end if;
  return new;
end $$;
revoke all on function erase_on_withdraw() from public, anon, authenticated;

drop trigger if exists profiles_erase_on_withdraw on profiles;
create trigger profiles_erase_on_withdraw
  before update of account_state on profiles
  for each row execute function erase_on_withdraw();

-- ═══════════════════ 자격: 휴대폰 인증까지 ═══════════════════

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
     and p.phone_verified_at is not null
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
       and t.phone_verified_at is not null
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
        photo_reject_reason, photo_paths, phone_verified_at
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
    and phone_verified_at is not null
    and photo_state = 'approved';

