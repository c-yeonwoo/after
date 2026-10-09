-- Paid service ends no later than 12 months after ticket issue. A failed
-- meeting returns a usable ticket, not a payment refund. The replacement keeps
-- the original deadline so a retry cannot extend the paid service period.
alter table tickets add column expires_at timestamptz;
update tickets set expires_at = issued_at + interval '12 months';
alter table tickets alter column expires_at set not null;
alter table tickets alter column expires_at set default (now() + interval '12 months');
alter table tickets add column restored_from_ticket_id uuid unique references tickets(id);
create index tickets_usable on tickets (user_id, kind, expires_at)
  where state = 'unused' and not refund_locked;

create or replace function refund_ticket(p_ticket_id uuid, p_reason text) returns tickets
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ticket tickets;
  v_replacement tickets;
begin
  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found or v_ticket.kind <> 'meeting' or v_ticket.state <> 'used' then
    raise exception 'ticket not restorable' using errcode = 'P0002';
  end if;

  update tickets set state = 'refunded', refunded_at = now()
   where id = p_ticket_id
  returning * into v_ticket;

  -- meetings.ticket_id is unique. Reusing the old row would make the next
  -- meeting fail its FK uniqueness check and would erase the old usage trail.
  insert into tickets
    (user_id, kind, price_krw, expires_at, restored_from_ticket_id)
  values
    (v_ticket.user_id, v_ticket.kind, v_ticket.price_krw,
     v_ticket.expires_at, v_ticket.id)
  returning * into v_replacement;

  insert into events (user_id, name, props)
  values (v_ticket.user_id, 'ticket_refunded',
          jsonb_build_object('ticket_id', p_ticket_id,
                             'restored_ticket_id', v_replacement.id,
                             'reason', p_reason));
  return v_ticket;
end $$;

comment on function refund_ticket(uuid, text) is
  'Internal meeting-ticket restoration, not a card payment refund. Retires the used row and issues one replacement with the original expiry.';

-- Latest open_intro definition from s28b, with the expiry guard added.
create or replace function open_intro() returns intros
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_intro  intros;
  v_card   intro_queue;
  v_ticket tickets;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if my_gender() <> 'male' then
    raise exception 'only male users receive introductions' using errcode = '42501';
  end if;

  select * into v_intro from intros
   where male_id = v_uid and closed_at is null;
  if found then
    return v_intro;
  end if;

  select * into v_card from intro_queue
   where male_id = v_uid
     and opened_at is null
     and delivered_at is not null
     and expires_at > now()
     and not is_excluded(v_uid, female_id)
   order by position, created_at
   limit 1
   for update skip locked;
  if not found then
    raise exception 'no eligible candidate' using errcode = 'P0002';
  end if;

  select * into v_ticket from tickets
   where user_id = v_uid and state = 'unused' and kind = 'intro'
     and expires_at > now() and not refund_locked
   order by expires_at, issued_at
   limit 1
   for update skip locked;
  if not found then
    raise exception 'no unused intro ticket' using errcode = 'P0003';
  end if;

  insert into intros (male_id, female_id, curated_by)
  values (v_uid, v_card.female_id, v_card.curated_by)
  returning * into v_intro;

  update tickets
     set state = 'used', used_at = now(), intro_id = v_intro.id
   where id = v_ticket.id;

  update intro_queue set opened_at = now() where id = v_card.id;
  perform promote_intro_queue(v_uid);

  insert into events (user_id, name, props)
  values (v_uid, 'intro_opened',
          jsonb_build_object('intro_id', v_intro.id, 'ticket_id', v_ticket.id,
                             'curated_by', v_card.curated_by));
  return v_intro;
end $$;

-- Latest use_meeting_ticket definition from s19, with the expiry guard added.
create or replace function use_meeting_ticket(p_intro_id uuid) returns meetings
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_ticket  tickets;
  v_meeting meetings;
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

  select * into v_ticket from tickets
   where user_id = v_uid and state = 'unused' and kind = 'meeting'
     and expires_at > now() and not refund_locked
   order by expires_at, issued_at
   limit 1
   for update skip locked;
  if not found then
    raise exception 'no unused ticket' using errcode = 'P0002';
  end if;

  update tickets
     set state = 'used', used_at = now(), intro_id = p_intro_id
   where id = v_ticket.id;

  insert into meetings (intro_id, ticket_id) values (p_intro_id, v_ticket.id)
  returning * into v_meeting;

  insert into events (user_id, name, props)
  values (v_uid, 'ticket_used',
          jsonb_build_object('intro_id', p_intro_id, 'ticket_id', v_ticket.id,
                             'kind', 'meeting'));
  return v_meeting;
end $$;
