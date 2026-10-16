begin;
select plan(3);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('62c00000-0000-0000-0000-000000000001','man62c@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('62c00000-0000-0000-0000-000000000002','woman62c1@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('62c00000-0000-0000-0000-000000000003','woman62c2@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);
insert into profiles (id, gender, hub_id, company_email, email_verified_at,
                      name, onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('62c00000-0000-0000-0000-000000000001','male','gangnam','man62c@t.co',now(),'남성62c',7,now(),now(),'member'),
  ('62c00000-0000-0000-0000-000000000002','female','gangnam','woman62c1@t.co',now(),'여성62c1',7,now(),now(),'member'),
  ('62c00000-0000-0000-0000-000000000003','female','gangnam','woman62c2@t.co',now(),'여성62c2',7,now(),now(),'member');
insert into intro_queue(id,male_id,female_id,position,curated_by,delivered_at,expires_at)
values
  ('62c00000-0000-0000-0000-000000000011',
   '62c00000-0000-0000-0000-000000000001',
   '62c00000-0000-0000-0000-000000000002',1,
   '62c00000-0000-0000-0000-000000000001',now(),now()+interval '21 days'),
  ('62c00000-0000-0000-0000-000000000012',
   '62c00000-0000-0000-0000-000000000001',
   '62c00000-0000-0000-0000-000000000003',2,
   '62c00000-0000-0000-0000-000000000001',now()-interval '22 days',now()-interval '1 day');
select is((select count(*) from domain_events where event_type = 'intro_delivered'
  and aggregate_id in ('62c00000-0000-0000-0000-000000000011',
                       '62c00000-0000-0000-0000-000000000012'))::integer,
  2, '소개 전송은 두 원본 카드로 정확히 계측된다');
update intro_queue set opened_at = now()
 where id = '62c00000-0000-0000-0000-000000000011';
select is((select count(*) from domain_events where event_type = 'intro_opened'
  and aggregate_id = '62c00000-0000-0000-0000-000000000011')::integer,
  1, '실제 열람은 전송과 구분해 계측된다');
delete from intro_queue where id = '62c00000-0000-0000-0000-000000000012';
select is((select count(*) from domain_events where event_type = 'intro_expired'
  and aggregate_id = '62c00000-0000-0000-0000-000000000012')::integer,
  1, '만료 삭제 전에 사건이 남는다');

select * from finish();
rollback;
