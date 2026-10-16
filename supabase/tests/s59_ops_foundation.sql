begin;
select plan(12);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('59000000-0000-0000-0000-000000000001','admin59@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('59000000-0000-0000-0000-000000000002','member59@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('59000000-0000-0000-0000-000000000003','man59@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('59000000-0000-0000-0000-000000000004','woman59@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('59000000-0000-0000-0000-000000000001','male','gangnam','admin59@t.co',now(),'운영59',7,now(),now(),'admin'),
  ('59000000-0000-0000-0000-000000000002','female','gangnam','member59@t.co',now(),'회원59',7,now(),now(),'member'),
  ('59000000-0000-0000-0000-000000000003','male','gangnam','man59@t.co',now(),'남성59',7,now(),now(),'member'),
  ('59000000-0000-0000-0000-000000000004','female','gangnam','woman59@t.co',now(),'여성59',7,now(),now(),'member');

update profiles set phone_verified_at = now(),
  photo_paths = array[id::text || '/1.png', id::text || '/2.png', id::text || '/3.png']
where id in ('59000000-0000-0000-0000-000000000003',
             '59000000-0000-0000-0000-000000000004');
update profiles set photo_state = 'approved', photo_reviewed_at = now()
where id in ('59000000-0000-0000-0000-000000000003',
             '59000000-0000-0000-0000-000000000004');

insert into affinities (from_id, to_id, verdict) values
  ('59000000-0000-0000-0000-000000000002', '59000000-0000-0000-0000-000000000003', 'like'),
  ('59000000-0000-0000-0000-000000000004', '59000000-0000-0000-0000-000000000003', 'like');

insert into support_requests(user_id, category, body, created_at)
select '59000000-0000-0000-0000-000000000002', 'other',
       '문의 내용입니다. 번호 ' || n, now() - n * interval '1 second'
  from generate_series(1, 201) n;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"59000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select admin_support_page('open') $$,
  '42501', null, '일반 회원은 운영 문의 페이지를 조회할 수 없다'
);

set local request.jwt.claims =
  '{"sub":"59000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select admin_support_page('open', null, null, 51) $$,
  '22023', null, '운영 페이지 크기는 50건을 넘을 수 없다'
);
select is(
  (admin_support_page('open') ->> 'total')::integer,
  201, '200건 제한과 무관하게 정확한 미답변 전체 건수를 보여준다'
);
select is(
  jsonb_array_length(admin_support_page('open') -> 'items'),
  30, '첫 페이지는 기본 30건이다'
);
select ok(
  admin_support_page('open') -> 'next_cursor' is not null,
  '다음 페이지 커서가 있다'
);
select ok(
  (admin_support_page('open') -> 'items' -> 0 ->> 'id') is distinct from
  (admin_support_page('open',
    (admin_support_page('open') #>> '{next_cursor,created_at}')::timestamptz,
    (admin_support_page('open') #>> '{next_cursor,id}')::uuid) -> 'items' -> 0 ->> 'id'),
  '커서 이동으로 첫 행이 반복되지 않는다'
);
-- eligible_profiles는 클라이언트 직접 SELECT를 막는다. 관리자 RPC와 원본 뷰를
-- 비교하는 부분만 테스트 소유자로 돌아가며, JWT의 admin 주체는 유지한다.
reset role;
select is(
  (admin_marketplace_health() #>> '{pool,eligible_female}')::integer,
  (select count(*)::integer from eligible_profiles where gender = 'female'),
  '운영 여성 공급과 실제 후보 자격 수가 일치한다'
);
select is(
  (admin_marketplace_health() #>> '{pool,eligible_male}')::integer,
  (select count(*)::integer from eligible_profiles where gender = 'male'),
  '운영 남성 공급과 실제 후보 자격 수가 일치한다'
);
select is(
  (admin_dashboard() #>> '{backlog,unmatched_likes}')::integer,
  (select count(*)::integer from eligible_profiles e
     cross join lateral admin_like_pool(e.id) p where e.gender = 'male'),
  '홈의 큐레이션 가능 호감 수는 실제 호감 풀과 일치한다'
);
select is(
  (select count(*)::integer from admin_like_pool('59000000-0000-0000-0000-000000000003')),
  1, '테스트 풀에는 자격을 갖춘 여성의 호감만 들어간다'
);
select ok(
  (admin_dashboard() #>> '{backlog,blocked_likes}')::integer >= 1,
  '사진 미검수 여성의 호감은 자격 대기로 분리한다'
);
select is(
  (admin_dashboard() #>> '{backlog,starved_males}')::integer,
  (select count(*)::integer from eligible_profiles p
     where p.gender = 'male' and not exists (
       select 1 from intro_queue q where q.male_id = p.id and q.opened_at is null)),
  '공급 없는 남성은 현재 소개 자격이 있는 회원만 센다'
);

select * from finish();
rollback;
