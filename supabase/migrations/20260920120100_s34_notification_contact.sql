-- S34b — 회사 인증 메일과 서비스 알림 메일 분리 + 빠진 핵심 알림.
--
-- 회사 메일은 재직/가입 확인에만 쓴다. 소개·약속 정보가 회사 메일함에 남지
-- 않도록, 사용자가 별도로 확인한 개인 메일만 트랜잭션 알림 수신처로 사용한다.

alter table profiles
  add column notification_email text,
  add column notification_email_verified_at timestamptz;

comment on column profiles.notification_email is
  '서비스 진행 알림 수신처. notification_email_verified_at 이 있어야 발송한다. 회사 인증 메일과 분리한다.';

comment on column profiles.notification_email_verified_at is
  '개인 알림 메일의 소유 확인 시각. 클라이언트가 직접 수정할 수 없다.';

-- 짧은 확인 코드는 profiles 에 두지 않는다. 사용자는 자기 profiles 행의 모든
-- 컬럼을 읽을 수 있으므로, 6자리 코드 해시라도 그곳에 두면 오프라인 대입이 쉽다.
create table notification_email_verifications (
  user_id      uuid primary key references profiles(id) on delete cascade,
  email        text not null,
  code_hash    bytea not null,
  expires_at   timestamptz not null,
  attempts     smallint not null default 0 check (attempts between 0 and 5),
  requested_at timestamptz not null default now()
);

alter table notification_email_verifications enable row level security;
revoke all on notification_email_verifications from public, anon, authenticated;
grant select, insert, update, delete on notification_email_verifications to service_role;

-- meeting_id 가 없는 소개 도착·후보 보충·노쇼 사건도 멱등하게 만들기 위한 키.
alter table notifications add column event_id uuid;
create unique index notifications_event_once
  on notifications (user_id, kind, event_id)
  where event_id is not null;

create or replace function request_notification_email(p_email text)
  returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_code  text;
  v_prev  notification_email_verifications;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email) > 254 then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if not exists (select 1 from profiles where id = v_uid and account_state = 'active') then
    raise exception 'active profile required' using errcode = '42501';
  end if;

  select * into v_prev from notification_email_verifications where user_id = v_uid;
  if found and v_prev.requested_at > now() - interval '1 minute' then
    raise exception 'verification requested too recently' using errcode = '55000';
  end if;

  -- pgcrypto 난수 32비트를 0..999999 로 줄인다. lpad 로 선행 0을 보존한다.
  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000))::text, 6, '0');

  insert into notification_email_verifications
    (user_id, email, code_hash, expires_at, attempts, requested_at)
  values
    (v_uid, v_email, extensions.digest(v_uid::text || ':' || v_code, 'sha256'),
     now() + interval '15 minutes', 0, now())
  on conflict (user_id) do update
    set email = excluded.email,
        code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        attempts = 0,
        requested_at = excluded.requested_at;

  -- 아직 발송되지 않은 옛 코드는 더 이상 유효하지 않다.
  update notifications
     set attempts = 5, last_error = 'superseded verification code', payload = '{}'::jsonb
   where user_id = v_uid
     and kind = 'notification_email_verify'
     and sent_at is null;

  insert into notifications (user_id, kind, payload)
  values (v_uid, 'notification_email_verify',
          jsonb_build_object('email', v_email, 'verification_code', v_code));

  return v_email;
end $$;

revoke all on function request_notification_email(text) from public, anon;
grant execute on function request_notification_email(text) to authenticated;

create or replace function verify_notification_email(p_code text)
  returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_row notification_email_verifications;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select * into v_row
    from notification_email_verifications
   where user_id = v_uid
   for update;

  if not found or v_row.expires_at <= now() or v_row.attempts >= 5 then
    return false;
  end if;

  if extensions.digest(v_uid::text || ':' || btrim(p_code), 'sha256') <> v_row.code_hash then
    update notification_email_verifications
       set attempts = least(attempts + 1, 5)
     where user_id = v_uid;
    return false;
  end if;

  update profiles
     set notification_email = v_row.email,
         notification_email_verified_at = now(),
         updated_at = now()
   where id = v_uid;

  delete from notification_email_verifications where user_id = v_uid;

  -- 주소가 없어서 보류됐던 최근 진행 알림을 새 수신처로 다시 보낸다.
  update notifications
     set attempts = 0, last_error = null
   where user_id = v_uid
     and sent_at is null
     and last_error = 'verified notification email missing';

  return true;
end $$;

revoke all on function verify_notification_email(text) from public, anon;
grant execute on function verify_notification_email(text) to authenticated;

-- 소개 카드가 실제로 상위 3장에 들어와 전달된 순간에만 알린다.
create or replace function intro_queue_notify_delivered()
  returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.delivered_at is not null
     and (tg_op = 'INSERT' or old.delivered_at is null) then
    insert into notifications (user_id, kind, event_id, payload)
    values (new.male_id, 'intro_delivered', new.id,
            jsonb_build_object('counterpart_id', new.female_id))
    on conflict (user_id, kind, event_id) where event_id is not null do nothing;
  end if;
  return new;
end $$;

create trigger intro_queue_notify_delivered_after
  after insert or update of delivered_at on intro_queue
  for each row execute function intro_queue_notify_delivered();

revoke all on function intro_queue_notify_delivered() from public, anon, authenticated;

-- 노쇼 신고를 받은 사람은 앱을 우연히 열 때까지 기다리면 안 된다. 신고의 사실
-- 여부 판단은 바꾸지 않고, 이미 존재하는 응답 기한을 알려 주기만 한다.
create or replace function no_show_notify_accused()
  returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into notifications (user_id, kind, meeting_id, event_id, payload)
  values (new.accused_id, 'no_show_response_required', new.meeting_id, new.id,
          jsonb_build_object('counterpart_id', new.reporter_id,
                             'confirm_by', new.confirm_by))
  on conflict (user_id, kind, event_id) where event_id is not null do nothing;
  return new;
end $$;

create trigger no_show_notify_accused_after
  after insert on no_show_reports
  for each row execute function no_show_notify_accused();

revoke all on function no_show_notify_accused() from public, anon, authenticated;

-- 여성의 평가 후보가 0명이었다가 새 남성이 자격을 갖춘 경우만 알린다.
-- 프로필 INSERT 때는 온보딩이 끝나지 않으므로 UPDATE 전이만 보면 된다.
create or replace function profile_candidate_ready(p profiles)
  returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p.role = 'member'
     and p.gender = 'male'
     and p.email_verified_at is not null
     and p.account_state = 'active'
     and p.onboarding_step = 7
     and p.terms_agreed_at is not null
     and p.privacy_agreed_at is not null
     and p.paused_at is null
     and p.name is not null
     and (p.photo_url is null or p.photo_state = 'approved')
$$;

revoke all on function profile_candidate_ready(profiles) from public, anon, authenticated;

create or replace function notify_candidate_refill()
  returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if profile_candidate_ready(old) or not profile_candidate_ready(new) then
    return new;
  end if;

  insert into notifications (user_id, kind, event_id, payload)
  select f.id, 'candidates_refilled', new.id,
         jsonb_build_object('counterpart_id', new.id)
    from eligible_profiles f
   where f.gender = 'female'
     and f.hub_id = new.hub_id
     and not is_excluded(f.id, new.id)
     and not exists (
       select 1 from affinities a
        where a.from_id = f.id and a.to_id = new.id
     )
     -- 새 후보를 빼면 평가할 사람이 없던 여성에게만 보낸다.
     and not exists (
       select 1
         from eligible_profiles m
        where m.gender = 'male'
          and m.hub_id = f.hub_id
          and m.id <> new.id
          and not is_excluded(f.id, m.id)
          and not exists (
            select 1 from affinities a
             where a.from_id = f.id and a.to_id = m.id
          )
     )
  on conflict (user_id, kind, event_id) where event_id is not null do nothing;

  return new;
end $$;

create trigger profiles_notify_candidate_refill_after
  after update on profiles
  for each row execute function notify_candidate_refill();

revoke all on function notify_candidate_refill() from public, anon, authenticated;

comment on function notify_candidate_refill() is
  '평가 후보가 비어 있던 여성에게 같은 권역의 새 후보가 생겼음을 한 번 알린다.';
