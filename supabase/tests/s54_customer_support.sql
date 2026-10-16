begin;
select plan(9);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('54000000-0000-0000-0000-000000000001', 'member54@corp.example', 'x', now(), 'authenticated', 'authenticated'),
  ('54000000-0000-0000-0000-000000000002', 'other54@corp.example', 'x', now(), 'authenticated', 'authenticated'),
  ('54000000-0000-0000-0000-000000000003', 'admin54@corp.example', 'x', now(), 'authenticated', 'authenticated');

insert into profiles (id, gender, hub_id, company_email, role)
values
  ('54000000-0000-0000-0000-000000000001', 'male', 'gangnam', 'member54@corp.example', 'member'),
  ('54000000-0000-0000-0000-000000000002', 'female', 'gangnam', 'other54@corp.example', 'member'),
  ('54000000-0000-0000-0000-000000000003', 'male', 'gangnam', 'admin54@corp.example', 'admin');

set local role authenticated;
set local request.jwt.claims = '{"sub":"54000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select create_support_request('payment', '결제 후 티켓 발급 내역이 보이지 않습니다.') $$,
  'T1 회원은 문의를 접수한다'
);
select is((select count(*)::int from my_support_requests()), 1, 'T2 본인 문의가 보인다');
select throws_ok(
  $$ select count(*) from support_requests $$,
  '42501', null, 'T3 원본 테이블을 직접 읽을 수 없다'
);
select throws_ok(
  $$ select count(*) from admin_support_requests('open') $$,
  '42501', 'admin only', 'T4 일반 회원은 운영함을 읽을 수 없다'
);
select throws_ok(
  $$ select respond_support_request((select id from my_support_requests() limit 1), '답변') $$,
  '42501', 'admin only', 'T5 일반 회원은 답변할 수 없다'
);

set local request.jwt.claims = '{"sub":"54000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from my_support_requests()), 0, 'T6 다른 회원 문의는 보이지 않는다');

set local request.jwt.claims = '{"sub":"54000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::int from admin_support_requests('open')), 1, 'T7 운영함에 미답변 문의가 보인다');
select lives_ok(
  $$ select respond_support_request((select id from admin_support_requests('open') limit 1), '발급 내역을 확인했습니다.') $$,
  'T8 운영자는 답변을 남긴다'
);
reset role;

update profiles set account_state = 'withdrawn'
where id = '54000000-0000-0000-0000-000000000001';
select is((select count(*)::int from support_requests), 0, 'T9 탈퇴 시 문의 본문을 삭제한다');

select * from finish();
rollback;
