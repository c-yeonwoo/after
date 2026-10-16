-- 통신사 본인확인 준비. 운영 게이트는 실연동 검증 후 identity_required 로 켠다.
alter table profiles add column identity_verified_at timestamptz;
alter table profiles add column identity_verification_id text;
create unique index profiles_identity_verification_unique on profiles(identity_verification_id)
  where identity_verification_id is not null;

-- DI 해시는 profiles SELECT * 로도 브라우저에 내려가지 않도록 별도 비공개 테이블에 둔다.
create table carrier_identity_links (
  user_id uuid primary key references profiles(id) on delete cascade,
  di_hash text not null unique
);
alter table carrier_identity_links enable row level security;
revoke all on carrier_identity_links from public, anon, authenticated;
grant select, insert, update, delete on carrier_identity_links to service_role;

alter table app_settings add column identity_required boolean not null default false;
comment on column app_settings.identity_required is
  'KCP 실연동·기존 회원 전환 검증 후에만 true. true면 인증된 성인만 신규 소개/주문/만남 진행.';

create table identity_verification_attempts (
  id text primary key check (id ~ '^av[0-9a-f]{32}$'),
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index identity_verification_attempts_user on identity_verification_attempts(user_id, created_at desc);
alter table identity_verification_attempts enable row level security;
revoke all on identity_verification_attempts from public, anon, authenticated;
grant select, insert, update, delete on identity_verification_attempts to service_role;

-- Edge Function만 호출한다. 공급자 응답의 VERIFIED 여부는 Edge Function이 먼저 확인한다.
create function finish_carrier_identity(
  p_user uuid, p_id text, p_birth date, p_phone text, p_di text
) returns profiles
  language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_attempt identity_verification_attempts;
  v_profile profiles;
begin
  select * into v_attempt from identity_verification_attempts
   where id = p_id for update;
  if not found or v_attempt.user_id <> p_user or v_attempt.consumed_at is not null
     or v_attempt.created_at < now() - interval '15 minutes' then
    raise exception 'verification attempt expired' using errcode = 'P0002';
  end if;
  if p_birth is null or extract(year from age((now() at time zone 'Asia/Seoul')::date, p_birth)) < 19 then
    raise exception 'adult only' using errcode = '22023';
  end if;
  if p_phone !~ '^\+82[0-9]{9,10}$' or nullif(btrim(p_di), '') is null then
    raise exception 'incomplete verified identity' using errcode = '22023';
  end if;
  begin
    insert into carrier_identity_links(user_id, di_hash)
    values (p_user, encode(extensions.digest(p_di, 'sha256'), 'hex'))
    on conflict (user_id) do update set di_hash = excluded.di_hash;
  exception when unique_violation then
    raise exception 'identity already in use' using errcode = '23505';
  end;
  begin
    update profiles
       set birth = p_birth, phone = p_phone, phone_verified_at = now(),
           identity_verified_at = now(), identity_verification_id = p_id
     where id = p_user and account_state = 'active'
    returning * into v_profile;
  exception when unique_violation then
    raise exception 'phone in use' using errcode = '23505';
  end;
  if not found then
    raise exception 'active profile not found' using errcode = 'P0002';
  end if;
  update identity_verification_attempts set consumed_at = now() where id = p_id;
  return v_profile;
end $$;
revoke all on function finish_carrier_identity(uuid, text, date, text, text)
  from public, anon, authenticated;
grant execute on function finish_carrier_identity(uuid, text, date, text, text) to service_role;

-- 인증 뒤에는 사용자가 생일/번호를 다시 바꿀 수 없다. 재인증(service_role)은 허용.
create function protect_carrier_identity() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  if old.identity_verified_at is not null and current_user <> 'service_role'
     and (new.birth is distinct from old.birth or new.phone is distinct from old.phone) then
    raise exception 'verified identity is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_protect_carrier_identity before update of birth, phone on profiles
  for each row execute function protect_carrier_identity();

-- 탈퇴 시 인증 메타데이터도 파기한다. 기존 s56 트리거보다 먼저 실행되도록 별도 트리거.
create function erase_carrier_identity() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.account_state = 'withdrawn' and old.account_state is distinct from 'withdrawn' then
    new.identity_verified_at := null;
    new.identity_verification_id := null;
    delete from carrier_identity_links where user_id = old.id;
  end if;
  return new;
end $$;
create trigger profiles_erase_carrier_identity before update of account_state on profiles
  for each row execute function erase_carrier_identity();

create function carrier_identity_required() returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select identity_required from app_settings where id), false)
$$;

create function carrier_adult_verified(p_user uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from profiles p where p.id = p_user
    and p.identity_verified_at is not null
    and p.birth is not null
    and extract(year from age((now() at time zone 'Asia/Seoul')::date, p.birth)) >= 19)
$$;

-- 기존 자가 입력 연령 트리거도 같은 한국 날짜를 사용한다.
create or replace function enforce_profile_adult_age() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  if new.birth is not null
     and extract(year from age((now() at time zone 'Asia/Seoul')::date, new.birth)) < 19 then
    raise exception 'must be at least 19 years old' using errcode = '23514';
  end if;
  return new;
end $$;

-- 롤아웃 전에는 동작을 바꾸지 않는다. 롤아웃 후 신규 소개/평가/주문/만남은 DB에서 차단.
create function require_carrier_adult() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid;
begin
  if not carrier_identity_required() then return new; end if;
  if tg_table_name = 'intros' then
    if not carrier_adult_verified(new.male_id) or not carrier_adult_verified(new.female_id) then
      raise exception 'carrier adult verification required' using errcode = '42501';
    end if;
    return new;
  elsif tg_table_name = 'affinities' then
    v_user := new.from_id;
    if not carrier_adult_verified(new.to_id) then
      raise exception 'carrier adult verification required' using errcode = '42501';
    end if;
  elsif tg_table_name = 'meetings' then
    if not exists (select 1 from intros i where i.id = new.intro_id
      and carrier_adult_verified(i.male_id) and carrier_adult_verified(i.female_id)) then
      raise exception 'carrier adult verification required' using errcode = '42501';
    end if;
    return new;
  elsif tg_table_name = 'messages' then
    if not exists (select 1 from meetings m join intros i on i.id = m.intro_id
      where m.id = new.meeting_id
        and carrier_adult_verified(i.male_id) and carrier_adult_verified(i.female_id)) then
      raise exception 'carrier adult verification required' using errcode = '42501';
    end if;
    return new;
  else
    v_user := new.user_id;
  end if;
  if not carrier_adult_verified(v_user) then
    raise exception 'carrier adult verification required' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger carrier_adult_affinity before insert on affinities
  for each row execute function require_carrier_adult();
create trigger carrier_adult_intro before insert on intros
  for each row execute function require_carrier_adult();
create trigger carrier_adult_order before insert on ticket_orders
  for each row execute function require_carrier_adult();
create trigger carrier_adult_meeting before insert on meetings
  for each row execute function require_carrier_adult();
create trigger carrier_adult_message before insert on messages
  for each row execute function require_carrier_adult();

create function require_carrier_adult_ticket_use() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.state = 'used' and old.state is distinct from 'used'
     and carrier_identity_required() and not carrier_adult_verified(new.user_id) then
    raise exception 'carrier adult verification required' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger carrier_adult_ticket_use before update of state on tickets
  for each row execute function require_carrier_adult_ticket_use();

-- URL 직접 호출로 기존 소개/대화를 열어보는 경로도 막는다. 본인 프로필은 재인증에 필요하다.
create policy profiles_carrier_identity_read on profiles as restrictive
  for select to authenticated using (
    id = auth.uid() or not carrier_identity_required()
    or carrier_adult_verified(auth.uid()) or is_admin()
  );
create policy intros_carrier_identity_read on intros as restrictive
  for select to authenticated using (
    not carrier_identity_required() or carrier_adult_verified(auth.uid()) or is_admin()
  );
create policy meetings_carrier_identity_read on meetings as restrictive
  for select to authenticated using (
    not carrier_identity_required() or carrier_adult_verified(auth.uid()) or is_admin()
  );
create policy messages_carrier_identity_read on messages as restrictive
  for select to authenticated using (
    not carrier_identity_required() or carrier_adult_verified(auth.uid()) or is_admin()
  );

-- 게이트 활성화 후에는 큐가 미인증 후보를 고르지 않게 자격 판정도 함께 좁힌다.
create or replace function profile_candidate_ready(p profiles) returns boolean
  language sql stable set search_path = public, pg_temp as $$
  select p.role = 'member' and p.gender = 'male'
     and p.email_verified_at is not null and p.account_state = 'active'
     and p.onboarding_step = 7 and p.terms_agreed_at is not null
     and p.privacy_agreed_at is not null and p.paused_at is null
     and p.name is not null and coalesce(cardinality(p.photo_paths), 0) >= 3
     and p.phone_verified_at is not null and p.photo_state = 'approved'
     and (not carrier_identity_required() or (
       p.identity_verified_at is not null and p.birth is not null
       and extract(year from age((now() at time zone 'Asia/Seoul')::date, p.birth)) >= 19
     ))
$$;

create or replace function is_eligible_candidate(p_id uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from profiles t where t.id = p_id
    and profile_candidate_ready(t) and t.hub_id = my_hub_id())
$$;

create or replace view eligible_profiles with (security_invoker = true) as
 select id, gender, hub_id, company_email, email_verified_at, account_state, banned_reason,
        name, birth, job, photo_url, mbti, smoking, drinking, religion, headline, interests,
        match_tags, topics, onboarding_step, created_at, updated_at, intro, details,
        match_note, topic_note, terms_agreed_at, privacy_agreed_at, agreed_policy_version,
        feedback_emails, paused_at, role, photo_state, photo_reviewed_at, photo_reviewed_by,
        photo_reject_reason, photo_paths, phone_verified_at
   from profiles
  where role = 'member' and email_verified_at is not null and account_state = 'active'
    and onboarding_step = 7 and terms_agreed_at is not null and privacy_agreed_at is not null
    and paused_at is null and name is not null and coalesce(cardinality(photo_paths), 0) >= 3
    and phone_verified_at is not null and photo_state = 'approved'
    and (not carrier_identity_required() or carrier_adult_verified(id));

-- public_profiles는 기본 security-definer 뷰여서 위 profiles RLS만으로는 부족하다.
create or replace view public_profiles as
select p.id, p.hub_id, p.name,
  case when p.birth is null then null else extract(year from age(p.birth))::int end as age,
  p.job, p.photo_url, p.mbti, p.smoking, p.drinking, p.religion,
  p.headline, p.intro, p.interests, p.match_tags, p.topics, p.details, p.photo_paths
from profiles p
where (p.id = auth.uid() or (
  not is_excluded(auth.uid(), p.id) and (
    exists (select 1 from intros i where i.closed_at is null
      and ((i.male_id = auth.uid() and i.female_id = p.id)
        or (i.female_id = auth.uid() and i.male_id = p.id)))
    or exists (select 1 from meetings m join intros i on i.id = m.intro_id
      where m.cancelled_at is null
        and ((i.male_id = auth.uid() and i.female_id = p.id)
          or (i.female_id = auth.uid() and i.male_id = p.id)))
    or (my_gender() = 'female' and p.gender = 'male' and is_eligible_candidate(p.id))
  )
)) and (p.id = auth.uid() or not carrier_identity_required()
  or carrier_adult_verified(auth.uid()) or is_admin());
