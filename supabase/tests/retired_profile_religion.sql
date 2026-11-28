begin;
select no_plan();
insert into auth.users(id,email) values ('b0280000-0000-0000-0000-000000000001','retired-field@example.test');
insert into public.profiles(id,gender,hub_id,company_email,religion)
values ('b0280000-0000-0000-0000-000000000001','female','gangnam','retired-field@example.test','legacy-test');
select ok(religion is null, 'an old signup client cannot store a religion') from public.profiles
where id='b0280000-0000-0000-0000-000000000001';
update public.profiles set religion='old-client', job='디자이너' where id='b0280000-0000-0000-0000-000000000001';
select ok(religion is null and job='디자이너','legacy profile edits still save the supported fields')
from public.profiles where id='b0280000-0000-0000-0000-000000000001';
select is((select count(*)::int from after_retired.profile_religion where user_id='b0280000-0000-0000-0000-000000000001'),0,'new writes are not archived');
insert into public.onboarding_drafts(user_id, data) values
('b0280000-0000-0000-0000-000000000001','{"step":2,"basics":{"name":"가상회원","religion":"legacy-test"}}');
select is(data,'{"step":2,"basics":{"name":"가상회원"}}'::jsonb,'draft strips only the retired field')
from public.onboarding_drafts where user_id='b0280000-0000-0000-0000-000000000001';
insert into public.profile_interview_drafts(user_id,data) values
('b0280000-0000-0000-0000-000000000001','{"version":2,"conditions":{"religion":"legacy-test","smoking":"none"}}');
select is(data,'{"version":2,"conditions":{"smoking":"none"}}'::jsonb,'interview draft drops retired condition')
from public.profile_interview_drafts where user_id='b0280000-0000-0000-0000-000000000001';
select ok(not has_schema_privilege(r,'after_retired','USAGE') and
          not has_table_privilege(r,'after_retired.profile_religion','SELECT'),
          r||' cannot access pre-migration values')
from unnest(array['anon','authenticated','service_role']) r;
insert into after_retired.profile_religion(user_id,prior_value) values
('b0280000-0000-0000-0000-000000000001','pre-migration fixture');
update public.profiles set account_state='withdrawn' where id='b0280000-0000-0000-0000-000000000001';
select is((select count(*)::int from after_retired.profile_religion where user_id='b0280000-0000-0000-0000-000000000001'),0,'withdrawal erases the isolated legacy field');
select * from finish();
rollback;
