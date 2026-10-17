-- Existing phone collection was for authentication. Operational calling is
-- separately opt-in; old members are NOT silently opted in.
create table public.member_contact_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  allowed boolean not null,
  version text not null check(version='meeting-contact-v1'),
  updated_at timestamptz not null default now()
);
alter table public.member_contact_preferences enable row level security;
revoke all on public.member_contact_preferences from public,anon,authenticated;
create table public.member_contact_preference_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  allowed boolean not null,
  version text not null,
  occurred_at timestamptz not null default now()
);
alter table public.member_contact_preference_events enable row level security;
revoke all on public.member_contact_preference_events from public,anon,authenticated;

create function public.my_meeting_contact_preference() returns boolean
  language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select allowed from public.member_contact_preferences where user_id=auth.uid()),false)
$$;
revoke all on function public.my_meeting_contact_preference() from public,anon;
grant execute on function public.my_meeting_contact_preference() to authenticated;

create function public.set_meeting_contact_preference(p_allowed boolean,p_version text) returns boolean
  language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and account_state='active') then
    raise exception 'active account required' using errcode='42501'; end if;
  if p_allowed is null or p_version is distinct from 'meeting-contact-v1' then
    raise exception 'explicit consent version required' using errcode='22023'; end if;
  insert into public.member_contact_preferences(user_id,allowed,version) values(auth.uid(),p_allowed,p_version)
    on conflict(user_id) do update set allowed=excluded.allowed,version=excluded.version,updated_at=now();
  insert into public.member_contact_preference_events(user_id,allowed,version) values(auth.uid(),p_allowed,p_version);
  return p_allowed;
end $$;
revoke all on function public.set_meeting_contact_preference(boolean,text) from public,anon;
grant execute on function public.set_meeting_contact_preference(boolean,text) to authenticated;

alter table public.ops_case_events drop constraint ops_case_events_event_type_check;
alter table public.ops_case_events add constraint ops_case_events_event_type_check check(event_type in (
  'opened','source_changed','started','waiting','snoozed','reopened','resolved','superseded','contact_viewed'));

create function public.admin_meeting_contact_details(p_case_id uuid,p_expected_version integer,p_request_id uuid)
  returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.ops_cases; result jsonb; other_case uuid;
begin
  if not public.is_admin() or not public.admin_sensitive_auth_ok() then
    raise exception 'authorized admin required' using errcode='42501'; end if;
  select * into c from public.ops_cases where id=p_case_id;
  if c.source_id !~ '^[0-9a-f-]{36}$' then
    raise exception 'contact case unavailable' using errcode='PT409'; end if;
  if c.id is null or c.case_type<>'meeting_followup' or c.status in ('resolved','superseded') or
     c.version is distinct from p_expected_version or not public.meeting_contact_needed(c.source_id::uuid) then
    raise exception 'contact case unavailable' using errcode='PT409'; end if;
  if p_request_id is null then raise exception 'request ID required' using errcode='22023'; end if;
  select case_id into other_case from public.ops_case_events where request_id=p_request_id;
  if found and other_case<>c.id then raise exception 'request ID conflict' using errcode='PT409'; end if;
  insert into public.ops_case_events(case_id,event_type,actor_type,actor_id,from_status,to_status,reason_code,note,request_id)
    values(c.id,'contact_viewed','admin',auth.uid(),c.status,c.status,'meeting_coordination',
      '약속 참석 확인을 위한 동의한 회원의 연락처 조회',p_request_id) on conflict(request_id) do nothing;
  select jsonb_agg(jsonb_build_object('name',p.name,'userId',p.id,
    'allowed',coalesce(pref.allowed,false),
    'phone',case when pref.allowed and p.phone_verified_at is not null then p.phone end) order by p.id) into result
    from public.meetings m join public.intros i on i.id=m.intro_id
    join public.profiles p on p.id in(i.male_id,i.female_id) and p.account_state='active'
    left join public.member_contact_preferences pref on pref.user_id=p.id where m.id::text=c.source_id;
  return result;
end $$;
revoke all on function public.admin_meeting_contact_details(uuid,integer,uuid) from public,anon;
grant execute on function public.admin_meeting_contact_details(uuid,integer,uuid) to authenticated;

create function public.erase_contact_preference_on_withdrawal() returns trigger
  language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.account_state='withdrawn' and old.account_state<>'withdrawn' then
    delete from public.member_contact_preferences where user_id=new.id;
    delete from public.member_contact_preference_events where user_id=new.id;
  end if;
  return new;
end $$;
revoke all on function public.erase_contact_preference_on_withdrawal() from public,anon,authenticated;
create trigger erase_contact_preference after update of account_state on public.profiles
  for each row execute function public.erase_contact_preference_on_withdrawal();

insert into public.policy_catalog(version,status,published_at,note)
values('2026-10-17.3','published',now(),'운영 연락의 선택 동의·철회·접근 기록 고지; 기존 회원을 자동 동의시키지 않음');
update public.policy_control set signup_version='2026-10-17.3',version=version+1,updated_at=now()
  where id and required_reconsent_version is null;
do $$ begin
  if (select signup_version from public.policy_control where id) is distinct from '2026-10-17.3' then
    raise exception 'review active reconsent before changing signup policy';
  end if;
end $$;
