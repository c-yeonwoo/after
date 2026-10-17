-- Explicit versioned commands distinguish the current UI (which presents the
-- check-in/cancellation notice) from an old tab or a previously sent request.
alter table public.meetings add column if not exists male_attendance_policy_ack_at timestamptz;
alter table public.meetings add column if not exists female_attendance_policy_ack_at timestamptz;
create or replace function public.enroll_meeting_attendance() returns trigger
  language plpgsql set search_path=public,pg_temp as $$
begin
  if new.confirmed_at is not null and
     (old.confirmed_at is null or new.scheduled_at is distinct from old.scheduled_at) then
    new.attendance_policy_version:=case when new.male_attendance_policy_ack_at is not null
      and new.female_attendance_policy_ack_at is not null then 'checkin-v1' end;
    new.male_attendance_at:=null;new.female_attendance_at:=null;
  end if;
  return new;
end $$;

create function public.request_meeting_v2(p_intro_id uuid,p_slots timestamptz[],p_place_id uuid,p_place_name text)
  returns public.meetings language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.meetings;
begin
  m:=public.request_meeting(p_intro_id,p_slots,p_place_id,p_place_name);
  update public.meetings set male_attendance_policy_ack_at=now() where id=m.id returning * into m;
  return m;
end $$;
revoke all on function public.request_meeting_v2(uuid,timestamptz[],uuid,text) from public,anon;
grant execute on function public.request_meeting_v2(uuid,timestamptz[],uuid,text) to authenticated;

create function public.accept_meeting_slot_v2(p_meeting_id uuid,p_index integer)
  returns public.meetings language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.meetings m set female_attendance_policy_ack_at=now()
    from public.intros i where m.id=p_meeting_id and i.id=m.intro_id and i.female_id=auth.uid()
      and m.cancelled_at is null and m.confirmed_at is null;
  if not found then raise exception 'meeting not available' using errcode='42501'; end if;
  return public.accept_meeting_slot(p_meeting_id,p_index);
end $$;
revoke all on function public.accept_meeting_slot_v2(uuid,integer) from public,anon;
grant execute on function public.accept_meeting_slot_v2(uuid,integer) to authenticated;

create function public.submit_meeting_prefs_v2(p_meeting_id uuid,p_prefs jsonb)
  returns public.meetings language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.meetings;
begin
  m:=public.submit_meeting_prefs(p_meeting_id,p_prefs);
  update public.meetings set female_attendance_policy_ack_at=now() where id=m.id returning * into m;
  return m;
end $$;
revoke all on function public.submit_meeting_prefs_v2(uuid,jsonb) from public,anon;
grant execute on function public.submit_meeting_prefs_v2(uuid,jsonb) to authenticated;

create function public.confirm_meeting_v2(p_meeting_id uuid,p_scheduled_at timestamptz,p_place_name text,p_place_kind text default null)
  returns public.meetings language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.meetings m set male_attendance_policy_ack_at=now()
    from public.intros i where m.id=p_meeting_id and i.id=m.intro_id and i.male_id=auth.uid()
      and m.cancelled_at is null and m.confirmed_at is null;
  if not found then raise exception 'meeting not available' using errcode='42501'; end if;
  return public.confirm_meeting(p_meeting_id,p_scheduled_at,p_place_name,p_place_kind);
end $$;
revoke all on function public.confirm_meeting_v2(uuid,timestamptz,text,text) from public,anon;
grant execute on function public.confirm_meeting_v2(uuid,timestamptz,text,text) to authenticated;
