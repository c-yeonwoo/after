-- S66: 약속 가능 시간은 상대에게 원본을 공개하지 않는다.
-- 평소 가능한 요일·시각을 14일 동안만 추천에 쓰고, 실제 약속은 양쪽이 다시 확인한다.
create table meet_windows (
  user_id uuid primary key references profiles(id) on delete cascade,
  weekdays smallint[] not null,
  earliest_local time not null,
  updated_at timestamptz not null default now(),
  constraint meet_windows_weekdays_check check (
    cardinality(weekdays) between 1 and 5
    and weekdays <@ array[1, 2, 3, 4, 5]::smallint[]
  ),
  constraint meet_windows_time_check check (
    earliest_local in (time '18:30', time '19:00', time '19:30', time '20:00')
  )
);

comment on table meet_windows is
  '회원의 평소 가능한 퇴근 후 요일·가장 이른 시각. 상대에게 직접 노출하지 않는다.';
alter table meet_windows enable row level security;
revoke all on meet_windows from public, anon, authenticated;

create function my_meet_window() returns jsonb
  language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'weekdays', w.weekdays,
    'earliest_local', to_char(w.earliest_local, 'HH24:MI'),
    'updated_at', w.updated_at,
    'fresh', w.updated_at > now() - interval '14 days'
  )
    from meet_windows w where w.user_id = auth.uid()
$$;

create function save_my_meet_window(p_weekdays smallint[], p_earliest_local text)
  returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_time time;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from profiles where id = v_uid and account_state = 'active'
                 and onboarding_step >= 7) then
    raise exception 'profile not ready' using errcode = '42501';
  end if;
  if p_weekdays is null or cardinality(p_weekdays) not between 1 and 5
     or p_weekdays <@ array[1, 2, 3, 4, 5]::smallint[] is not true
     or (select count(distinct d) from unnest(p_weekdays) d) <> cardinality(p_weekdays) then
    raise exception 'invalid weekdays' using errcode = '22023';
  end if;
  if p_earliest_local not in ('18:30', '19:00', '19:30', '20:00') then
    raise exception 'invalid time' using errcode = '22023';
  end if;
  v_time := p_earliest_local::time;

  insert into meet_windows(user_id, weekdays, earliest_local, updated_at)
  values (v_uid, p_weekdays, v_time, now())
  on conflict (user_id) do update set weekdays = excluded.weekdays,
    earliest_local = excluded.earliest_local, updated_at = now();

  insert into events(user_id, name, props) values
    (v_uid, 'meet_window_updated', jsonb_build_object('weekday_count', cardinality(p_weekdays)));
  return my_meet_window();
end $$;

create function clear_my_meet_window() returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  delete from meet_windows where user_id = auth.uid();
end $$;

-- 소개를 연 당사자에게도 상대의 요일 원본은 주지 않는다. 양쪽이 최근에 입력한
-- 시간의 교집합만 약속 후보로 계산한다. 후보가 없어도 직접 제안은 가능하다.
create function suggested_meeting_slots(p_intro_id uuid)
  returns table(slot timestamptz)
  language sql stable security definer set search_path = public, pg_temp as $$
  select (g.day::date + t.local_time) at time zone 'Asia/Seoul' as slot
    from intros i
    join meet_windows m on m.user_id = i.male_id
    join meet_windows f on f.user_id = i.female_id
    cross join generate_series(
      (now() at time zone 'Asia/Seoul')::date + 1,
      (now() at time zone 'Asia/Seoul')::date + 14,
      interval '1 day'
    ) as g(day)
    cross join (values (time '18:30'), (time '19:00'),
                       (time '19:30'), (time '20:00')) as t(local_time)
   where i.id = p_intro_id and i.male_id = auth.uid() and i.closed_at is null
     and m.updated_at > now() - interval '14 days'
     and f.updated_at > now() - interval '14 days'
     and extract(isodow from g.day)::smallint = any(m.weekdays)
     and extract(isodow from g.day)::smallint = any(f.weekdays)
     and t.local_time >= greatest(m.earliest_local, f.earliest_local)
     and (g.day::date + t.local_time) at time zone 'Asia/Seoul' > now() + interval '3 hours'
   order by slot
   limit 16
$$;

-- 운영자는 선택한 큐 후보의 준비 상태만 읽는다. 회원용 RPC와 달리 원본을 볼 수
-- 있으나, 인증된 관리자만 호출할 수 있고 한 번에 최대 50명으로 제한한다.
create function admin_meet_windows(p_users uuid[])
  returns table(user_id uuid, weekdays smallint[], earliest_local text, updated_at timestamptz)
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if cardinality(p_users) > 50 then
    raise exception 'too many users' using errcode = '22023';
  end if;
  return query
    select w.user_id, w.weekdays, to_char(w.earliest_local, 'HH24:MI'), w.updated_at
      from meet_windows w join profiles p on p.id = w.user_id
     where w.user_id = any(p_users) and p.account_state = 'active';
end $$;

create function purge_meet_window_on_withdraw() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.account_state = 'withdrawn' and old.account_state is distinct from 'withdrawn' then
    delete from meet_windows where user_id = new.id;
  end if;
  return new;
end $$;
create trigger purge_meet_window_on_withdraw
  after update of account_state on profiles
  for each row execute function purge_meet_window_on_withdraw();
revoke all on function purge_meet_window_on_withdraw() from public, anon, authenticated;

revoke all on function my_meet_window() from public, anon;
revoke all on function save_my_meet_window(smallint[], text) from public, anon;
revoke all on function clear_my_meet_window() from public, anon;
revoke all on function suggested_meeting_slots(uuid) from public, anon;
revoke all on function admin_meet_windows(uuid[]) from public, anon;
grant execute on function my_meet_window() to authenticated;
grant execute on function save_my_meet_window(smallint[], text) to authenticated;
grant execute on function clear_my_meet_window() to authenticated;
grant execute on function suggested_meeting_slots(uuid) to authenticated;
grant execute on function admin_meet_windows(uuid[]) to authenticated;
