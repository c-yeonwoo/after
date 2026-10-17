begin;
select plan(18);
select set_config('test.policy_control_version',
  (select version::text from public.policy_control where id), true);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
 ('65000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin65@corp.example','',now(),now(),now()),
 ('65000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','man65@corp.example','',now(),now(),now());
insert into public.profiles(id,gender,hub_id,company_email,email_verified_at,name,onboarding_step,
  role,terms_agreed_at,privacy_agreed_at,agreed_policy_version,phone_verified_at,
  photo_paths,photo_state)
values
 ('65000000-0000-0000-0000-000000000001','male','gangnam','admin65@corp.example',now(),'운영65',7,
  'admin',now(),now(),'2026-10-17.3',now(),array['a','b','c'],'approved'),
 ('65000000-0000-0000-0000-000000000002','male','gangnam','man65@corp.example',now(),'회원65',7,
  'member',now(),now(),'2026-10-17.3',now(),array['a','b','c'],'approved');

select is((select required_reconsent_version from public.policy_control where id),null::text,
 'reconsent is not enforced before legal approval');
select is(public.member_policy_current('65000000-0000-0000-0000-000000000002'),true,
 'legacy member retains access while enforcement is off');
select is((select count(*)::integer from public.policy_consents
  where user_id='65000000-0000-0000-0000-000000000002' and evidence_source='legacy'),0,
 'a synthetic preexisting row is not falsely backfilled at creation');

set local role authenticated;
set local request.jwt.claims =
 '{"sub":"65000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select public.record_consent('invented-version')$$,'PT409',null,
 'client cannot self-select an arbitrary policy version');
select is(public.my_policy_status()->>'reconsent_required','false',
 'member sees no required reconsent yet');
select throws_ok($$select public.admin_policy_preview()$$,'42501',null,
 'member cannot inspect policy rollout');
reset role;

set local role authenticated;
set local request.jwt.claims =
 '{"sub":"65000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}';
select throws_ok($$select public.admin_activate_policy_reconsent(
  current_setting('test.policy_control_version')::integer,now()+interval '2 days','법률 검토 완료 후 적용합니다',gen_random_uuid())$$,
  '42501',null,'activation requires AAL2 even when global MFA flag is off');
reset role;
set local role authenticated;
set local request.jwt.claims =
 '{"sub":"65000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}';
select is((public.admin_activate_policy_reconsent(
  current_setting('test.policy_control_version')::integer,now()+interval '2 days','법률 검토 완료 후 적용합니다',gen_random_uuid())->>'required_version'),
  '2026-10-17.3','operator can schedule a future effective date');
reset role;
select is(public.member_policy_current('65000000-0000-0000-0000-000000000002'),true,
 'future effective date does not block current access');

update public.policy_control set reconsent_effective_at=now()-interval '1 minute' where id;
select is(public.member_policy_current('65000000-0000-0000-0000-000000000002'),false,
 'legacy evidence is not misrepresented as explicit new consent');
select is((public.member_readiness('65000000-0000-0000-0000-000000000002')->'blockers') ?
  'policy_required',true,'server readiness blocks new matching');
select is((select count(*)::integer from public.eligible_profiles
  where id='65000000-0000-0000-0000-000000000002'),0,
 'candidate view uses the same policy gate');
set local role authenticated;
set local request.jwt.claims =
 '{"sub":"65000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(public.home_state_v2()->>'primary_state','policy_required',
 'home points to the dedicated reconsent flow');
select throws_ok($$select public.create_ticket_order(1::smallint,'meeting'::public.ticket_kind)$$,'PT409',null,
 'new order is blocked while reconsent is required');
select is((public.record_consent('2026-10-17.3')).agreed_policy_version,
 '2026-10-17.3','explicit consent is recorded for approved version');
reset role;
select is(public.member_policy_current('65000000-0000-0000-0000-000000000002'),true,
 'matching access resumes after explicit consent');
set local role authenticated;
set local request.jwt.claims =
 '{"sub":"65000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}';
select is((public.admin_pause_policy_reconsent(current_setting('test.policy_control_version')::integer+1,'적용 결과 재검토를 위해 중지합니다',
 gen_random_uuid())->>'required_version'),null::text,
 'operator can pause the policy rollout with audit');
reset role;
select is((select version from public.policy_control where id),current_setting('test.policy_control_version')::integer+2,
 'pause increments the policy control version');

select * from finish();
rollback;
