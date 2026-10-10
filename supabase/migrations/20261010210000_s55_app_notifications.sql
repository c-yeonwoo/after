-- S55 — 메일 알림을 앱 알림으로 (2026-10-10)
--
-- 소개·약속 알림을 개인 메일로 보내던 것을 그만둔다. 회원은 가입 마지막에 알림
-- 메일을 한 번 더 인증해야 했고, 인증하지 않으면 알림이 한 통도 가지 않았다.
--
-- 이제:
--   · iOS 앱 — APNs 푸시(send-notifications 가 device_tokens 로 보낸다)
--   · 웹     — 푸시 없음. 로그인하면 상단 종 아이콘에 안 읽은 알림이 보인다
-- 알림 행(notifications)은 그대로 쌓이고, 그 행이 곧 화면 속 알림 목록이다.
-- 메일로 나가는 것은 로그인·가입 인증 코드뿐이다(Supabase Auth).

alter table notifications add column if not exists read_at timestamptz;
create index if not exists notifications_user_recent on notifications (user_id, created_at desc);

-- ═══════════════════ 기기 토큰 ═══════════════════

create table if not exists device_tokens (
  token       text primary key check (char_length(token) between 32 and 200),
  user_id     uuid not null references profiles (id) on delete cascade,
  platform    text not null default 'ios' check (platform in ('ios')),
  -- APNs 는 개발 빌드(sandbox)와 배포 빌드(production)의 토큰이 다르다.
  -- 처음엔 모르므로 null. 발송이 성공한 쪽으로 기록한다.
  apns_env    text check (apns_env in ('production', 'sandbox')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists device_tokens_user on device_tokens (user_id);

alter table device_tokens enable row level security;
revoke all on device_tokens from public, anon, authenticated;
grant select, insert, update, delete on device_tokens to service_role;

/*
  같은 기기를 다른 계정으로 쓰면 토큰이 새 계정으로 옮겨 가야 한다. 아니면 로그아웃한
  사람의 알림이 다음 사람의 잠금화면에 뜬다.
*/
create or replace function register_device_token(p_token text) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  insert into device_tokens (token, user_id)
  values (btrim(p_token), auth.uid())
  on conflict (token) do update
    set user_id = excluded.user_id, updated_at = now(),
        apns_env = case when device_tokens.user_id = excluded.user_id
                        then device_tokens.apns_env end;
end $$;
revoke all on function register_device_token(text) from public, anon;
grant execute on function register_device_token(text) to authenticated;

/* 로그아웃할 때 부른다. 남의 토큰은 지우지 못한다. */
create or replace function unregister_device_token(p_token text) returns void
  language sql security definer set search_path = public, pg_temp as $$
  delete from device_tokens where token = btrim(p_token) and user_id = auth.uid()
$$;
revoke all on function unregister_device_token(text) from public, anon;
grant execute on function unregister_device_token(text) to authenticated;

-- ═══════════════════ 화면 속 알림 목록 ═══════════════════

/*
  알림 행은 회원이 직접 읽지 못한다(s9, payload 에 운영 값이 섞일 수 있다). 목록에
  필요한 것만 함수로 낸다: 종류·시각·읽음·약속 id·상대 이름.

  상대 이름은 payload 의 counterpart_id, 없으면(후기 요청) 약속의 반대편이다.
  알림 메일 인증 코드(notification_email_verify)는 목록에 내지 않는다.
*/
create or replace function my_notifications(p_limit integer default 50)
  returns table (id uuid, kind notification_kind, created_at timestamptz, read_at timestamptz,
                 meeting_id uuid, counterpart_name text)
  language sql stable security definer set search_path = public, pg_temp as $$
  select n.id, n.kind, n.created_at, n.read_at, n.meeting_id,
         (select p.name from profiles p
           where p.id = coalesce(
             nullif(n.payload->>'counterpart_id', '')::uuid,
             (select case when i.male_id = n.user_id then i.female_id else i.male_id end
                from meetings m join intros i on i.id = m.intro_id
               where m.id = n.meeting_id)))
    from notifications n
   where n.user_id = auth.uid()
     and n.kind <> 'notification_email_verify'
   order by n.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;
revoke all on function my_notifications(integer) from public, anon;
grant execute on function my_notifications(integer) to authenticated;

create or replace function unread_notification_count() returns integer
  language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer from notifications
   where user_id = auth.uid() and read_at is null and kind <> 'notification_email_verify'
$$;
revoke all on function unread_notification_count() from public, anon;
grant execute on function unread_notification_count() to authenticated;

create or replace function mark_notifications_read() returns void
  language sql security definer set search_path = public, pg_temp as $$
  update notifications set read_at = now()
   where user_id = auth.uid() and read_at is null
$$;
revoke all on function mark_notifications_read() from public, anon;
grant execute on function mark_notifications_read() to authenticated;
