-- S56 — 인증 시도 제한, 사진·약속 입력 검증, 탈퇴 시 푸시 토큰 파기.

-- 예외를 던지면 같은 RPC의 attempts UPDATE도 롤백된다. 틀린 코드는 NULL을
-- 반환해 시도 횟수를 커밋하고, 클라이언트가 이를 오류 문구로 바꾼다.
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
    return null;
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

-- cardinality >= 3만으로는 같은 사진 경로 세 개를 한 장으로 속일 수 있다.
create or replace function profile_photo_paths_distinct(p_paths text[]) returns boolean
  language sql immutable set search_path = pg_temp as $$
  select (select count(*) from unnest(p_paths) as item(path)) =
         (select count(distinct path) from unnest(p_paths) as item(path)
           where path is not null and btrim(path) <> '')
$$;
revoke all on function profile_photo_paths_distinct(text[]) from public, anon, authenticated;
grant execute on function profile_photo_paths_distinct(text[]) to authenticated, service_role;

-- 기존 데이터에 중복이 있으면 첫 경로만 남기고 검수를 다시 받는다.
-- 한 번에 사용자 행을 갱신해 사진 검수 트리거도 정상 실행한다.
update profiles p
   set photo_paths = (
     select array_agg(path order by first_position)
       from (
         select path, min(position) as first_position
           from unnest(p.photo_paths) with ordinality as item(path, position)
          where path is not null and btrim(path) <> ''
          group by path
       ) distinct_paths
   )
 where p.photo_paths is not null
   and not profile_photo_paths_distinct(p.photo_paths);

alter table profiles add constraint profiles_photo_paths_distinct
  check (photo_paths is null or profile_photo_paths_distinct(photo_paths));

-- 탈퇴는 프로필 행을 지우지 않으므로 device_tokens 의 ON DELETE CASCADE가
-- 발동하지 않는다. 모든 기기의 토큰을 서버에서 파기한다.
create or replace function erase_on_withdraw() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.account_state = 'withdrawn' and old.account_state is distinct from 'withdrawn' then
    delete from device_tokens where user_id = new.id;
    new.phone             := null;
    new.phone_verified_at := null;
    new.evening_note      := null;
    new.known_as          := null;
  end if;
  return new;
end $$;

-- 소개 요청에만 평일 저녁 선택지를 적용한다. 기존의 대안 일정 협의는 별도 흐름이다.
create or replace function request_meeting(
  p_intro_id uuid, p_slots timestamptz[], p_place_id uuid, p_place_name text
) returns meetings
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n       integer := coalesce(array_length(p_slots, 1), 0);
  v_place   meet_places;
  v_name    text;
  v_meeting meetings;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if v_n < 1 or v_n > 3 then
    raise exception 'propose 1 to 3 slots' using errcode = '22023';
  end if;
  if (select count(distinct s) from unnest(p_slots) s) <> v_n then
    raise exception 'slots must be distinct' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_slots) s
              where s < now() + interval '3 hours' or s > now() + interval '21 days') then
    raise exception 'slots must be between 3 hours and 21 days from now' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_slots) s
              where extract(isodow from s at time zone 'Asia/Seoul') not between 1 and 5
                 or (s at time zone 'Asia/Seoul')::time not in
                    (time '18:30', time '19:00', time '19:30', time '20:00')) then
    raise exception 'slots must be weekday evenings' using errcode = '22023';
  end if;

  if p_place_id is not null then
    select * into v_place from meet_places
     where id = p_place_id and active and hub_id = my_hub_id();
    if not found then
      raise exception 'place not available' using errcode = '22023';
    end if;
    v_name := v_place.name || ' · ' || v_place.station || '역';
  else
    v_name := nullif(btrim(coalesce(p_place_name, '')), '');
    if v_name is null or char_length(v_name) > 60 then
      raise exception 'place required' using errcode = '22023';
    end if;
  end if;

  v_meeting := use_meeting_ticket(p_intro_id);
  update meetings
     set proposed_slots = (select array_agg(s order by s) from unnest(p_slots) s),
         proposed_place_id = p_place_id,
         proposed_place_name = v_name
   where id = v_meeting.id
  returning * into v_meeting;
  return v_meeting;
end $$;
