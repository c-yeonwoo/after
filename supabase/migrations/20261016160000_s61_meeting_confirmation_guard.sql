-- 같은 회원의 서로 다른 만남이 같은 시각에 동시에 확정되지 않도록 직렬화한다.
-- 90분 점유 정책은 미승인 상태이므로 정확히 같은 시작 시각만 막는다.
create or replace function public.guard_meeting_confirmation() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_participants uuid[];
  v_member uuid;
  v_active integer;
begin
  if new.confirmed_at is null or (
    old.confirmed_at is not null and new.scheduled_at is not distinct from old.scheduled_at
    and new.place_id is not distinct from old.place_id
    and new.accepted_slot is not distinct from old.accepted_slot
  ) then
    return new;
  end if;
  -- 이미 확정된 약속의 실제 만남 후 기록/정정은 과거 시각일 수 있다.
  -- 회원이 호출하는 confirm_meeting 은 자체적으로 미래 시각만 받는다.
  if new.completed_at is not null or
     (old.confirmed_at is not null and new.scheduled_at <= now()) then
    return new;
  end if;
  if new.cancelled_at is not null or new.scheduled_at is null or new.scheduled_at <= now() then
    raise exception 'meeting slot is no longer available' using errcode = '22007';
  end if;

  select array[i.male_id, i.female_id] into v_participants
    from public.intros i where i.id = new.intro_id;
  if coalesce(cardinality(v_participants), 0) <> 2 then
    raise exception 'meeting participants missing' using errcode = '23503';
  end if;

  -- 두 회원을 항상 동일한 순서로 잠가, 다른 meeting 행에서 동시에 확정해도
  -- 뒤의 트랜잭션이 앞의 확정 결과를 본 뒤 충돌을 검사하게 한다.
  for v_member in select unnest(v_participants) order by 1 loop
    perform 1 from public.profiles where id = v_member for update;
  end loop;
  select count(*) into v_active from public.profiles
   where id = any(v_participants) and account_state = 'active';
  if v_active <> 2 then
    raise exception 'participant account is no longer active' using errcode = '42501';
  end if;

  if new.accepted_slot is not null and (
    new.proposed_slots is null or new.accepted_slot < 0 or
    new.accepted_slot >= coalesce(cardinality(new.proposed_slots), 0) or
    new.scheduled_at is distinct from new.proposed_slots[new.accepted_slot + 1]
  ) then
    raise exception 'proposed slot changed' using errcode = '22023';
  end if;
  if new.place_id is not null and not exists (
    select 1 from public.meet_places p join public.profiles member
      on member.id = v_participants[1]
     where p.id = new.place_id and p.active and p.hub_id = member.hub_id
  ) then
    raise exception 'place no longer available' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.meetings m join public.intros i on i.id = m.intro_id
     where m.id <> new.id and m.confirmed_at is not null
       and m.cancelled_at is null and m.completed_at is null
       and m.scheduled_at = new.scheduled_at
       and (i.male_id = any(v_participants) or i.female_id = any(v_participants))
  ) then
    raise exception 'participant already has a meeting at this time' using errcode = '23505';
  end if;
  return new;
end $$;
revoke all on function public.guard_meeting_confirmation() from public, anon, authenticated;

create trigger guard_meeting_confirmation
  before update of confirmed_at, scheduled_at, place_id, accepted_slot on public.meetings
  for each row execute function public.guard_meeting_confirmation();
