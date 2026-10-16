-- 베타에서는 소개를 읽은 뒤 일정 후보를 바로 보낼 수 있다. 서버가 유효한
-- 요청 트랜잭션 안에서만 무료 만남 티켓을 발급하며, 기존 유료 티켓은 보존한다.
create or replace function use_meeting_ticket(p_intro_id uuid) returns meetings
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_ticket  tickets;
  v_meeting meetings;
  v_beta    boolean;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  perform 1 from intros
   where id = p_intro_id and male_id = v_uid and closed_at is null
   for update;
  if not found then
    raise exception 'intro not open for caller' using errcode = '42501';
  end if;

  select payments_enabled is false into v_beta from app_settings where id;
  if v_beta then
    select * into v_ticket from tickets
     where user_id = v_uid and state = 'unused' and kind = 'meeting'
       and price_krw = 0 and expires_at > now() and not refund_locked
     order by expires_at, issued_at
     limit 1 for update skip locked;
    if v_ticket.id is null then
      insert into tickets(user_id, kind, price_krw, payment_id)
      values (v_uid, 'meeting', 0, 'beta-meeting-intro:' || p_intro_id::text)
      on conflict (payment_id) where payment_id is not null do nothing
      returning * into v_ticket;
      if v_ticket.id is null then
        select * into v_ticket from tickets
         where payment_id = 'beta-meeting-intro:' || p_intro_id::text
         for update;
      end if;
      insert into events(user_id, name, props)
      values (v_uid, 'beta_meeting_issued', jsonb_build_object('intro_id', p_intro_id));
    end if;
  else
    select * into v_ticket from tickets
     where user_id = v_uid and state = 'unused' and kind = 'meeting'
       and expires_at > now() and not refund_locked
     order by expires_at, issued_at
     limit 1 for update skip locked;
  end if;

  if v_ticket.id is null or v_ticket.state <> 'unused' or v_ticket.user_id <> v_uid then
    raise exception 'no unused ticket' using errcode = 'P0002';
  end if;

  update tickets set state = 'used', used_at = now(), intro_id = p_intro_id
   where id = v_ticket.id;
  insert into meetings(intro_id, ticket_id) values (p_intro_id, v_ticket.id)
  returning * into v_meeting;

  insert into events(user_id, name, props)
  values (v_uid, 'ticket_used',
          jsonb_build_object('intro_id', p_intro_id, 'ticket_id', v_ticket.id,
                             'kind', 'meeting'));
  return v_meeting;
end $$;
