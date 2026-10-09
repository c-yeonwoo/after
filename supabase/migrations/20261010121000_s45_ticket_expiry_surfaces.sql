-- A 12-month ticket deadline is part of the paid service contract, including
-- tickets restored after a failed date. Service-role writers cannot extend it.
alter table tickets add constraint tickets_max_validity
  check (expires_at <= issued_at + interval '12 months');

-- No-show compensation previously minted a fresh 12-month ticket. Preserve
-- the original deadline and only compensate the member who paid the ticket.
create or replace function apply_no_show_confirmed(p_report_id uuid) returns no_show_reports
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_report no_show_reports;
  v_ticket tickets;
begin
  update no_show_reports set state = 'confirmed', resolved_at = now()
   where id = p_report_id and state = 'pending'
  returning * into v_report;
  if not found then
    raise exception 'report not pending' using errcode = 'P0002';
  end if;

  update profiles
     set account_state = 'banned',
         banned_reason = '노쇼 확인: ' || v_report.id::text
   where id = v_report.accused_id;

  select t.* into v_ticket
    from meetings m join tickets t on t.id = m.ticket_id
   where m.id = v_report.meeting_id;
  if v_ticket.user_id = v_report.reporter_id then
    insert into tickets (user_id, payment_id, price_krw, state, kind, expires_at)
    values (v_report.reporter_id, 'noshow_reissue:' || v_report.id,
            0, 'unused', 'meeting', v_ticket.expires_at);
  end if;

  insert into events (user_id, name, props)
  values (v_report.reporter_id, 'no_show_confirmed',
          jsonb_build_object('report_id', p_report_id, 'accused_id', v_report.accused_id));
  return v_report;
end $$;

-- Keep the existing profile allowlist intact while adding ticket expiry to
-- the operator view. The member detail RPC intentionally returns JSON only.
create or replace function admin_member_detail(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id',                    p.id,
      'gender',                p.gender,
      'hub_id',                p.hub_id,
      'company_email',         p.company_email,
      'email_verified_at',     p.email_verified_at,
      'account_state',         p.account_state,
      'banned_reason',         p.banned_reason,
      'name',                  p.name,
      'birth',                 p.birth,
      'job',                   p.job,
      'photo_url',             p.photo_url,
      'mbti',                  p.mbti,
      'smoking',               p.smoking,
      'drinking',              p.drinking,
      'religion',              p.religion,
      'headline',              p.headline,
      'interests',             p.interests,
      'match_tags',            p.match_tags,
      'topics',                p.topics,
      'onboarding_step',       p.onboarding_step,
      'created_at',            p.created_at,
      'intro',                 p.intro,
      'details',               p.details,
      'terms_agreed_at',       p.terms_agreed_at,
      'privacy_agreed_at',     p.privacy_agreed_at,
      'agreed_policy_version', p.agreed_policy_version,
      'paused_at',             p.paused_at,
      'role',                  p.role,
      'photo_state',           p.photo_state,
      'photo_reviewed_at',     p.photo_reviewed_at,
      'photo_reject_reason',   p.photo_reject_reason
    ),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'kind', t.kind, 'state', t.state,
               'price_krw', t.price_krw, 'issued_at', t.issued_at,
               'expires_at', t.expires_at,
               'used_at', t.used_at, 'refunded_at', t.refunded_at)
             order by t.issued_at desc)
        from tickets t where t.user_id = p.id), '[]'::jsonb),
    'meetings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'counterpart', case when i.male_id = p.id then f.name else mp.name end,
               'counterpart_id', case when i.male_id = p.id then i.female_id else i.male_id end,
               'role', case when i.male_id = p.id then 'male' else 'female' end,
               'scheduled_at', m.scheduled_at, 'place_name', m.place_name,
               'confirmed_at', m.confirmed_at, 'completed_at', m.completed_at,
               'cancelled_at', m.cancelled_at, 'cancel_reason', m.cancel_reason,
               'created_at', m.created_at)
             order by m.created_at desc)
        from meetings m
        join intros i  on i.id = m.intro_id
        join profiles mp on mp.id = i.male_id
        join profiles f  on f.id  = i.female_id
       where i.male_id = p.id or i.female_id = p.id), '[]'::jsonb),
    'reports_against', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'kind', r.kind, 'state', r.state,
               'detail', r.detail, 'created_at', r.created_at,
               'reporter_name', rp.name)
             order by r.created_at desc)
        from content_reports r join profiles rp on rp.id = r.reporter_id
       where r.accused_id = p.id), '[]'::jsonb),
    'reports_filed', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'kind', r.kind, 'state', r.state,
               'detail', r.detail, 'created_at', r.created_at,
               'accused_name', ap.name)
             order by r.created_at desc)
        from content_reports r join profiles ap on ap.id = r.accused_id
       where r.reporter_id = p.id), '[]'::jsonb),
    'admin_actions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', a.kind, 'note', a.note, 'created_at', a.created_at,
               'actor_name', actor.name)
             order by a.created_at desc)
        from admin_actions a join profiles actor on actor.id = a.actor_id
       where a.target_user = p.id), '[]'::jsonb)
  ) into v
  from profiles p where p.id = p_user;

  if v is null then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  return v;
end $$;
