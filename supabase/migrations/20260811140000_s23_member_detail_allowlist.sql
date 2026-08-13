-- S23 — 회원 상세를 허용 목록으로
--
-- docs/admin-design.md §6 에 미해결로 적어둔 것:
--   "admin_member_detail 이 프로필 전체를 낸다 — to_jsonb(profiles) 라 컬럼이
--    늘 때 함수를 고칠 필요가 없는 대신, 민감 컬럼이 붙으면 그대로 새어 나간다."
--
-- s17 에서 그렇게 만든 이유는 "운영자는 사용자에게 안 보이는 값까지 봐야 하고,
-- 컬럼이 늘 때마다 이 함수를 고칠 이유가 없다" 였다. 그 편의의 대가가 명확하다.
--
-- ── 거부 목록이 아니라 허용 목록이다 ──
-- to_jsonb(p) - '{민감컬럼}' 로 빼는 방식도 있었지만 방향이 틀렸다. 새로 추가된
-- 민감 컬럼은 그 목록에 없으므로 **그대로 새어 나간다.** 허용 목록은 반대로
-- 실패한다 — 새 컬럼은 누군가 의도적으로 더할 때까지 보이지 않는다.
--
-- 대가: 컬럼을 추가하고 운영 화면에서 쓰려면 이 함수를 고쳐야 한다. 그건 잊어도
-- 화면에 값이 안 나오는 것으로 끝나고, 반대 방향은 잊으면 유출로 끝난다.
--
-- ── 지금 빼는 것 ──
--   match_note · topic_note   온보딩에서 본인이 적는 메모. 판정에 쓸 일이 없다
--   feedback_emails           알림 수신 설정
--   updated_at                운영 판단에 쓰이지 않는다
--   photo_reviewed_by         검수자 id. 필요하면 admin_actions 에 이름으로 남는다
--
-- 사진 검수 상태와 동의 이력은 남긴다 — 분쟁 판정에 쓰인다.

create or replace function admin_member_detail(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    /*
      화면이 실제로 쓰는 컬럼만 나열한다. 순서는 profiles 의 선언 순서를 따라
      두었다 — 컬럼을 추가할 때 여기 빠졌는지 눈으로 대조하기 쉽다.
    */
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
      -- 사진 검수는 분쟁 판정 재료다. 반려 사유는 사용자에게도 보이는 문구다.
      'photo_state',           p.photo_state,
      'photo_reviewed_at',     p.photo_reviewed_at,
      'photo_reject_reason',   p.photo_reject_reason
    ),

    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'kind', t.kind, 'state', t.state,
               'price_krw', t.price_krw, 'issued_at', t.issued_at,
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

comment on function admin_member_detail(uuid) is
  '회원 상세. 프로필은 **허용 목록**이다 — 새 컬럼은 여기 추가할 때까지 안 나간다.';
