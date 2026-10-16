begin;
select plan(19);

update profiles set paused_at = now() where hub_id = 'yeouido';
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('60000000-0000-0000-0000-000000000001','woman60@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('60000000-0000-0000-0000-000000000002','man60@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);
insert into profiles (id, gender, hub_id, company_email, email_verified_at,
                      name, onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('60000000-0000-0000-0000-000000000001','female','yeouido','woman60@t.co',now(),'여성60',7,now(),now(),'member'),
  ('60000000-0000-0000-0000-000000000002','male','yeouido','man60@t.co',now(),'남성60',7,now(),now(),'member');

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ select member_readiness('60000000-0000-0000-0000-000000000002') $$,
  '42501', null, '내부 자격 함수로 다른 회원 상태를 조회할 수 없다');
select is((my_readiness()->>'ready')::boolean, false,
  '온보딩 7단계만으로 새 소개 자격을 부여하지 않는다');
select is(home_state_v2()->>'primary_state', 'phone_required',
  '휴대폰 미확인은 인증 행동을 안내한다');
reset role;

update profiles set phone_verified_at = now(),
  photo_paths = array[id::text || '/1.png', id::text || '/2.png', id::text || '/3.png']
where id in ('60000000-0000-0000-0000-000000000001',
             '60000000-0000-0000-0000-000000000002');

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(home_state_v2()->>'primary_state', 'photos_pending',
  '사진 검수 중에는 소개 준비 완료로 표시하지 않는다');
reset role;

update profiles set photo_state = 'approved', photo_reviewed_at = now()
where id = '60000000-0000-0000-0000-000000000002';

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::integer from next_candidate()), 0,
  '검수 중인 여성에게 새 남성 후보를 공개하지 않는다');
select is_empty(
  $$ select id from get_public_profile('60000000-0000-0000-0000-000000000002') $$,
  '검수 중에는 ID를 직접 알아도 새 후보 프로필을 볼 수 없다');
select throws_ok($$
  insert into affinities (from_id, to_id, verdict) values
    ('60000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000002', 'like')
$$, '42501', null, '자격 미달 상태에서는 호감을 기록할 수 없다');
reset role;

update profiles set photo_state = 'approved', photo_reviewed_at = now()
where id = '60000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((my_readiness()->>'ready')::boolean, true,
  '검수와 인증을 마치면 새 소개 자격이 생긴다');
select is((select count(*)::integer from get_public_profile('60000000-0000-0000-0000-000000000002')),
  1, '준비 완료 후에는 같은 권역의 새 후보 프로필을 볼 수 있다');
select is(home_state_v2()->>'primary_state', 'intro_available',
  '여성에게 실제 후보가 있으면 소개 확인을 안내한다');
select is(home_state_v2() #>> '{next_action,type}', 'view_intro',
  '소개 확인 행동은 명시적 enum으로 전달한다');
select is((home_state_v2() #>> '{ticket_summary,intro_available}')::integer, 0,
  '사용 가능한 소개 티켓 수는 서버에서 계산한다');
select is((select count(*)::integer from tickets where user_id = auth.uid()), 0,
  '홈 상태 조회는 티켓을 발급하거나 차감하지 않는다');
reset role;

insert into intros (male_id, female_id) values
  ('60000000-0000-0000-0000-000000000002',
   '60000000-0000-0000-0000-000000000001');
insert into tickets (user_id, state, kind, price_krw, intro_id, used_at)
select '60000000-0000-0000-0000-000000000002', 'used', 'meeting', 0, id,
       now() - interval '1 hour' from intros
 where male_id = '60000000-0000-0000-0000-000000000002';
insert into meetings (intro_id, ticket_id)
select i.id, t.id from intros i join tickets t on t.intro_id = i.id
 where i.male_id = '60000000-0000-0000-0000-000000000002';

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select deadline_at from my_request_deadlines()),
  now() + interval '23 hours',
  '여성 요청 목록의 기한은 티켓 실제 사용 시각 기준이다');
select ok((select as_of from my_request_deadlines()) is not null,
  '요청 목록은 기기 시각 보정을 위한 서버 시각도 제공한다');
set local request.jwt.claims =
  '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is_empty($$ select * from my_request_deadlines() $$,
  '남성은 상대 여성의 요청 목록을 조회할 수 없다');
reset role;

update meetings set scheduled_at = now() - interval '1 day',
  confirmed_at = now() - interval '2 days', private_opens_at = now() - interval '2 days',
  completed_at = now()
 where intro_id in (select id from intros
  where male_id = '60000000-0000-0000-0000-000000000002');
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(home_state_v2()->>'primary_state', 'waiting',
  '이미 완료된 만남을 현재 확정 약속으로 다시 표시하지 않는다');
select is((home_state_v2()->>'request_count')::integer, 0,
  '완료된 만남은 답변 대기 요청 수에 남지 않는다');
reset role;

update profiles set account_state = 'banned'
 where id = '60000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}';
select ok(home_state_v2()->>'primary_state' = 'account_unavailable'
       and not home_state_v2() ? 'candidate',
  '이용 제한 계정에는 후보 프로필을 반환하지 않는다');
reset role;

select * from finish();
rollback;
