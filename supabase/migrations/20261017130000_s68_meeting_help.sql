-- 약속 조율이 막힌 회원은 해당 만남에 묶어 운영팀 도움을 요청할 수 있다.
-- 기존 고객 문의·작업함을 그대로 사용하되 만남 식별자를 구조화한다.
alter table support_requests add column meeting_id uuid references meetings(id) on delete set null;
create unique index support_one_open_per_meeting_member
  on support_requests(user_id, meeting_id)
  where meeting_id is not null and status = 'open';

create function create_meeting_help_request(p_meeting_id uuid, p_body text) returns uuid
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'login required' using errcode = '28000';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 10 and 1000 then
    raise exception 'message length must be 10..1000' using errcode = '22023';
  end if;
  if not exists (
    select 1 from meetings m join intros i on i.id = m.intro_id
     where m.id = p_meeting_id and auth.uid() in (i.male_id, i.female_id)
       and m.cancelled_at is null and m.completed_at is null
  ) then
    raise exception 'meeting not available' using errcode = '42501';
  end if;
  if (select count(*) from support_requests
       where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  insert into support_requests(user_id, meeting_id, category, body)
  values (auth.uid(), p_meeting_id, 'introduction', btrim(p_body))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function create_meeting_help_request(uuid, text) from public, anon;
grant execute on function create_meeting_help_request(uuid, text) to authenticated;

create or replace function admin_support_page(
  p_status text default 'open', p_before timestamptz default null,
  p_before_id uuid default null, p_limit integer default 30
) returns jsonb language plpgsql stable security definer
  set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('open', 'answered') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_limit not between 1 and 50 or (p_before is null) <> (p_before_id is null) then
    raise exception 'invalid cursor or limit' using errcode = '22023';
  end if;

  with filtered as (
    select r.id, r.user_id, p.name::text as member_name, r.category,
           r.meeting_id, r.body, r.status, r.response, r.created_at, r.responded_at
      from support_requests r join profiles p on p.id = r.user_id
     where p_status is null or r.status = p_status
  ), page as (
    select f.*, row_number() over (order by f.created_at desc, f.id desc) as rn
      from filtered f
     where p_before is null or (f.created_at, f.id) < (p_before, p_before_id)
     order by f.created_at desc, f.id desc limit p_limit + 1
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(x) - 'rn' order by x.created_at desc, x.id desc)
                         from page x where x.rn <= p_limit), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'next_cursor', (select jsonb_build_object('created_at', x.created_at, 'id', x.id)
                      from page x where x.rn = p_limit and (select count(*) from page) > p_limit),
    'as_of', now()
  ) into v;
  return v;
end $$;
