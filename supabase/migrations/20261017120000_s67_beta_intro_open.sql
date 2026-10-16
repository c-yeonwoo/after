-- 무료 베타에서는 운영자에게 소개 티켓 발급을 요청하지 않아도 카드를 열 수 있다.
-- 결제가 켜져 있으면 기존 유료 티켓 규칙을 그대로 적용한다. 무료 기간 중에는
-- 이전에 구매한 티켓을 먼저 소진하지 않고 카드마다 무료 열람 티켓을 발급한다.
create or replace function open_intro() returns intros
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_intro  intros;
  v_card   intro_queue;
  v_ticket tickets;
  v_beta   boolean;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if my_gender() <> 'male' then
    raise exception 'only male users receive introductions' using errcode = '42501';
  end if;

  select * into v_intro from intros
   where male_id = v_uid and closed_at is null;
  if found then return v_intro; end if;

  select q.* into v_card from intro_queue q
   where q.id = (select id from next_openable_card(v_uid))
   for update skip locked;
  if not found then
    raise exception 'no eligible candidate' using errcode = 'P0002';
  end if;

  select payments_enabled is false into v_beta from app_settings where id;
  if v_beta then
    select * into v_ticket from tickets
     where user_id = v_uid and state = 'unused' and kind = 'intro'
       and price_krw = 0 and expires_at > now() and not refund_locked
     order by expires_at, issued_at
     limit 1 for update skip locked;
    if v_ticket.id is null then
      insert into tickets(user_id, kind, price_krw, payment_id)
      values (v_uid, 'intro', 0, 'beta-intro-card:' || v_card.id::text)
      on conflict (payment_id) where payment_id is not null do nothing
      returning * into v_ticket;
      if v_ticket.id is null then
        select * into v_ticket from tickets
         where payment_id = 'beta-intro-card:' || v_card.id::text
         for update;
      end if;
      insert into events(user_id, name, props)
      values (v_uid, 'beta_intro_issued', jsonb_build_object('queue_id', v_card.id));
    end if;
  else
    select * into v_ticket from tickets
     where user_id = v_uid and state = 'unused' and kind = 'intro'
       and expires_at > now() and not refund_locked
     order by expires_at, issued_at
     limit 1 for update skip locked;
  end if;

  if v_ticket.id is null or v_ticket.state <> 'unused' or v_ticket.user_id <> v_uid then
    raise exception 'no unused intro ticket' using errcode = 'P0003';
  end if;

  insert into intros (male_id, female_id, curated_by, reason)
  values (v_uid, v_card.female_id, v_card.curated_by, v_card.reason)
  returning * into v_intro;

  update tickets set state = 'used', used_at = now(), intro_id = v_intro.id
   where id = v_ticket.id;
  update intro_queue set opened_at = now() where id = v_card.id;
  perform promote_intro_queue(v_uid);

  insert into events (user_id, name, props)
  values (v_uid, 'intro_opened',
          jsonb_build_object('intro_id', v_intro.id, 'ticket_id', v_ticket.id,
                             'curated_by', v_card.curated_by,
                             'had_reason', v_card.reason is not null));
  return v_intro;
end $$;
