begin;
select plan(41);

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
select lives_ok($$ select public.begin_signup(repeat('a',64),'2026-11-29.1') $$,
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
  '42501','verified login required','이메일 세션만으로 휴대폰 가입 증빙을 가져갈 수 없다');
reset role;
select is(public.signup_account_phone(repeat('a',64)),'+821073000001','등록할 번호는 KCP 서버 결과에서만 가져온다');
select ok(not has_function_privilege('authenticated','public.signup_account_phone(text)','EXECUTE'),'브라우저가 가입용 전화번호를 조회할 수 없다');
update auth.users set email=null,phone='821073000001',phone_confirmed_at=now(),
 raw_app_meta_data='{"after_phone_signup":true}'
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

select public.begin_signup(repeat('b',64),'2026-11-29.1');
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

select public.begin_signup(repeat('c',64),'2026-11-29.1');
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

select ok((select company_email is null and email_verified_at is null from public.profiles
  where id='73000000-0000-0000-0000-000000000001'),'휴대폰 회원에게 이메일이나 메일 확인 시각을 만들지 않는다');
select ok(not (select (public.member_readiness_snapshot(p)->'blockers') ? 'email_unverified'
 from public.profiles p where p.id='73000000-0000-0000-0000-000000000001'),'휴대폰 회원은 이메일 때문에 소개가 막히지 않는다');
select public.begin_signup(repeat('e',64),'2026-11-29.1');
select public.start_preview_signup_identity(repeat('e',64),'av73000000000000000000000000000005');
select throws_ok($$select public.signup_account_phone(repeat('e',64))$$,'42501','signup identity required','실기기 미리보기는 계정을 만들 수 없다');

-- Kakao authentication identifies the pending login; it is not proof of adulthood.
insert into auth.users(id,aud,role) values
 ('73000000-0000-0000-0000-000000000003','authenticated','authenticated'),
 ('73000000-0000-0000-0000-000000000004','authenticated','authenticated');
insert into auth.identities(id,user_id,identity_data,provider,provider_id) select
 gen_random_uuid(),id,jsonb_build_object('sub',id),'kakao',id::text from auth.users
 where id in ('73000000-0000-0000-0000-000000000003','73000000-0000-0000-0000-000000000004');
set local role authenticated;
set local request.jwt.claims='{"sub":"73000000-0000-0000-0000-000000000003","role":"authenticated"}';
select public.begin_signup(repeat('f',64),'2026-11-29.1');
select throws_ok($$select public.create_signup_profile(repeat('f',64),'undecided')$$,'42501','signup identity required','카카오 로그인만으로는 가입이 끝나지 않는다');
reset role;
select public.start_signup_identity(repeat('f',64),'av73000000000000000000000000000006');
select public.finish_signup_identity(repeat('f',64),'av73000000000000000000000000000006','male','1995-04-05','+821073000006','di73f');
select throws_ok($$select public.signup_account_phone(repeat('f',64))$$,'42501','signup identity required','카카오 증빙으로 독립 전화 계정을 추가하지 않는다');
set local role authenticated;
set local request.jwt.claims='{"sub":"73000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok($$select public.create_signup_profile(repeat('f',64),'undecided')$$,'42501','verified login required','다른 카카오 계정으로 전환하면 가입이 막힌다');
set local request.jwt.claims='{"sub":"73000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((public.create_signup_profile(repeat('f',64),'undecided')).phone,'+821073000006','카카오 계정에 인증된 번호를 연결한다');
reset role;
select ok((select company_email is null and email_verified_at is null and identity_verified_at is not null
  from public.profiles where id='73000000-0000-0000-0000-000000000003'),'이메일 없는 카카오 회원의 인증 결과를 보존한다');
insert into auth.users(id,phone,created_at,raw_app_meta_data) values
 ('73000000-0000-0000-0000-000000000005','821073000005',now()-interval '2 hours','{"after_phone_signup":true}');
select public.purge_signup_sessions();
select ok(not exists(select 1 from auth.users where id='73000000-0000-0000-0000-000000000005'),'기한 내 가입되지 않은 휴대폰 인증 계정을 정리한다');
update public.profiles set account_state='withdrawn' where id='73000000-0000-0000-0000-000000000001';
select ok((select phone is null and phone_confirmed_at is null and encrypted_password is null from auth.users
 where id='73000000-0000-0000-0000-000000000001'),'탈퇴 시 새 전화 로그인 수단을 지운다');
select is(public.deny_auth_sms('{}')->'error'->>'http_code','403','Auth가 별도 문자 인증코드를 발송하지 않는다');
select * from finish();
rollback;
