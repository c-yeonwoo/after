begin;
select plan(28);

insert into auth.users(id,email,email_confirmed_at,aud,role)
values
  ('73000000-0000-0000-0000-000000000001','signup73a@corp.example',null,'authenticated','authenticated'),
  ('73000000-0000-0000-0000-000000000002','signup73b@corp.example',now(),'authenticated','authenticated');

select ok(not has_table_privilege('anon','public.signup_sessions','SELECT'),
  '가입 전 개인정보와 동의 기록은 공개 테이블로 조회할 수 없다');
select ok(not has_function_privilege('authenticated',
  'public.finish_signup_identity(text,text,public.gender,date,text,text)','EXECUTE'),
  '브라우저는 성별·생년월일을 인증 결과라고 직접 선언할 수 없다');
select throws_ok($$ select public.start_signup_identity(repeat('a',64),'av73000000000000000000000000000001') $$,
  'P0002','signup expired','사전 동의 없는 인증 요청은 거절한다');
select throws_ok($$ select public.begin_signup(repeat('a',64),'obsolete-version') $$,
  'PT409','policy_version_mismatch','현재 약관 버전에 동의해야 한다');

set local role anon;
select lives_ok($$ select public.begin_signup(repeat('a',64),'2026-10-31.1') $$,
  '계정 생성 전에 두 필수 동의를 서버 시각으로 기록할 수 있다');
select is((public.signup_session_status(repeat('a',64))->>'verified')::boolean,false,
  '동의만으로는 본인확인 완료가 되지 않는다');
reset role;
select lives_ok($$ select public.start_signup_identity(repeat('a',64),'av73000000000000000000000000000001') $$,
  '동의 후에만 해당 가입 세션에 인증 요청을 발급한다');
select throws_ok($$ select public.finish_signup_identity(repeat('a',64),
  'av73000000000000000000000000000001','female',(current_date-interval '18 years')::date,
  '+821073000001','di73a') $$,
  '22023','adult only','미성년 결과는 회사 인증 전에 거절한다');
select is((public.signup_session_status(repeat('a',64))->>'verified')::boolean,false,
  '거절된 결과는 검증된 신원으로 저장되지 않는다');
select is(public.finish_signup_identity(repeat('a',64),
  'av73000000000000000000000000000001','female','1994-02-15',
  '+821073000001','di73a')->>'gender','female','인증기관의 성별을 저장한다');
select ok(not has_table_privilege('authenticated','public.signup_sessions','UPDATE'),
  '회원은 가입 전 인증 결과를 고칠 수 없다');

update public.app_settings set identity_required=true where id;
set local role authenticated;
set local request.jwt.claims='{"sub":"73000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ select public.create_signup_profile(repeat('a',64),'gangnam','male') $$,
  '42501','email not confirmed','본인확인만 마치고 회사 인증을 생략할 수 없다');
reset role;
update auth.users set email_confirmed_at=now()
  where id='73000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((public.create_signup_profile(repeat('a',64),'gangnam','male')).gender::text,
  'female','수기 성별을 보내도 인증된 성별만 회원 정보에 반영한다');
reset role;
select ok((select birth='1994-02-15' and phone='+821073000001'
  and identity_verified_at is not null and phone_verified_at is not null
  from public.profiles where id='73000000-0000-0000-0000-000000000001'),
  '휴대폰·성인 확인과 생년월일을 한 번에 회원 정보로 옮긴다');
select ok((select p.terms_agreed_at=s.accepted_at and p.privacy_agreed_at=s.accepted_at
  and c.accepted_at=s.accepted_at from public.profiles p
  join public.signup_sessions s on s.claimed_by=p.id
  join public.policy_consents c on c.user_id=p.id and c.evidence_source='explicit'
  where p.id='73000000-0000-0000-0000-000000000001'),
  '가입 완료 시각이 아니라 가장 먼저 동의한 시각을 증빙으로 보존한다');
select ok((select verified_gender is null and verified_birth is null
  and verified_phone is null and verified_di_hash is null from public.signup_sessions
  where claimed_by='73000000-0000-0000-0000-000000000001'),
  '옮긴 뒤 임시 신원 정보는 지운다');
set local role authenticated;
select is((public.create_signup_profile(repeat('a',64),'gangnam')).id,
  '73000000-0000-0000-0000-000000000001'::uuid,'동일 계정의 재시도는 같은 회원 한 명만 반환한다');
set local request.jwt.claims='{"sub":"73000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$ select public.create_signup_profile(repeat('a',64),'gangnam') $$,
  'P0002','signup expired','소모한 본인확인 정보를 다른 계정에 재사용할 수 없다');
select throws_ok($$ select public.create_signup_profile(repeat('d',64),'gangnam') $$,
  'P0002','signup expired','토큰을 모르면 타인의 인증을 가져갈 수 없다');
select throws_ok($$ select public.create_my_profile('male','gangnam') $$,
  '42501','signup identity required','운영 게이트가 켜지면 구형 가입 RPC로 우회할 수 없다');
reset role;

select public.begin_signup(repeat('b',64),'2026-10-31.1');
set local role authenticated;
select throws_ok($$ select public.create_signup_profile(repeat('b',64),'gangnam','male') $$,
  '42501','signup identity required','미인증 가입 세션은 회사 메일을 확인해도 가입할 수 없다');
reset role;
select lives_ok($$ select public.start_signup_identity(repeat('b',64),
  'av'||lpad(to_hex(i),32,'0')) from generate_series(1,5) i $$,
  '인증 취소나 재시도는 정해진 횟수 안에서 가능하다');
select throws_ok($$ select public.start_signup_identity(repeat('b',64),
  'av00000000000000000000000000000006') $$,
  'P0001','daily limit','한 가입 세션에서 인증을 무한히 재시도할 수 없다');

select public.begin_signup(repeat('c',64),'2026-10-31.1');
select public.start_signup_identity(repeat('c',64),'av73000000000000000000000000000003');
select throws_ok($$ select public.finish_signup_identity(repeat('c',64),
  'av73000000000000000000000000000003','female','1994-02-15',
  '+821073000003','di73a') $$,
  '23505','identity already in use','이미 가입한 DI는 다른 이메일로 다시 쓸 수 없다');
update public.signup_sessions set policy_version='2026-10-17.1'
  where token_hash=encode(extensions.digest(repeat('c',64),'sha256'),'hex');
select throws_ok($$ select public.signup_session_status(repeat('c',64)) $$,
  'PT409','policy_version_mismatch','약관이 바뀌면 오래된 사전 동의를 재사용하지 않는다');

update public.signup_sessions set expires_at=now()-interval '1 minute'
  where token_hash=encode(extensions.digest(repeat('b',64),'sha256'),'hex');
select throws_ok($$ select public.signup_session_status(repeat('b',64)) $$,
  'P0002','signup expired','시간이 지난 가입 전 본인확인은 다시 시작해야 한다');
select public.purge_signup_sessions();
select is((select count(*)::integer from public.signup_sessions
  where token_hash=encode(extensions.digest(repeat('b',64),'sha256'),'hex')),0,
  '만료 정리는 미완료 가입 정보를 삭제한다');
select is((select count(*)::integer from public.signup_identity_attempts
  where id='av00000000000000000000000000000001'),0,
  '인증 요청 기록도 임시 가입 정보와 함께 삭제한다');

select * from finish();
rollback;
