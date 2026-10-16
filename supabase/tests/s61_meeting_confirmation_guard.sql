begin;
select plan(5);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('61000000-0000-0000-0000-000000000001','man611@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('61000000-0000-0000-0000-000000000002','man612@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('61000000-0000-0000-0000-000000000003','woman61@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);
insert into profiles (id, gender, hub_id, company_email, email_verified_at,
                      name, onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('61000000-0000-0000-0000-000000000001','male','gangnam','man611@t.co',now(),'남성611',7,now(),now(),'member'),
  ('61000000-0000-0000-0000-000000000002','male','gangnam','man612@t.co',now(),'남성612',7,now(),now(),'member'),
  ('61000000-0000-0000-0000-000000000003','female','gangnam','woman61@t.co',now(),'여성61',7,now(),now(),'member');
insert into intros (male_id, female_id) values
  ('61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000003'),
  ('61000000-0000-0000-0000-000000000002','61000000-0000-0000-0000-000000000003');
insert into tickets (user_id, state, kind, price_krw, intro_id, used_at)
select male_id, 'used', 'meeting', 0, id, now() from intros
 where female_id = '61000000-0000-0000-0000-000000000003';
insert into meetings (intro_id, ticket_id)
select i.id, t.id from intros i join tickets t on t.intro_id = i.id
 where i.female_id = '61000000-0000-0000-0000-000000000003';

select ok(not has_table_privilege('authenticated', 'meetings', 'UPDATE'),
  '회원은 guard 대상 컬럼을 직접 수정할 수 없다');
select lives_ok($$
  update meetings set scheduled_at = now() + interval '3 days',
    confirmed_at = now(), private_opens_at = now()
   where intro_id in (select id from intros
    where male_id = '61000000-0000-0000-0000-000000000001')
$$, '첫 약속은 확정할 수 있다');
select throws_ok($$
  update meetings set scheduled_at = now() + interval '3 days',
    confirmed_at = now(), private_opens_at = now()
   where intro_id in (select id from intros
    where male_id = '61000000-0000-0000-0000-000000000002')
$$, '23505', null, '같은 여성의 두 약속을 같은 시작 시각에 확정할 수 없다');
select throws_ok($$
  update meetings set scheduled_at = now() - interval '1 hour',
    confirmed_at = now(), private_opens_at = now()
   where intro_id in (select id from intros
    where male_id = '61000000-0000-0000-0000-000000000002')
$$, '22007', null, '지난 시각에는 새 약속을 확정할 수 없다');

update meetings set cancelled_at = now(), cancel_reason = 'test'
 where intro_id in (select id from intros
  where male_id = '61000000-0000-0000-0000-000000000001');
select lives_ok($$
  update meetings set scheduled_at = now() + interval '3 days',
    confirmed_at = now(), private_opens_at = now()
   where intro_id in (select id from intros
    where male_id = '61000000-0000-0000-0000-000000000002')
$$, '앞 약속이 취소된 뒤에는 해당 시각을 사용할 수 있다');

select * from finish();
rollback;
