begin;
select plan(6);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('41000000-0000-0000-0000-000000000001', 'kakao-unlink@test.local', 'x', now(), 'authenticated', 'authenticated'),
  ('41000000-0000-0000-0000-000000000002', 'kakao-unlink-self@test.local', 'x', now(), 'authenticated', 'authenticated');

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at)
values
  ('41000000-0000-0000-0000-000000000011', '41000000-0000-0000-0000-000000000001', '{}', 'kakao', '16005550123', now()),
  ('41000000-0000-0000-0000-000000000012', '41000000-0000-0000-0000-000000000001', '{}', 'email', '41000000-0000-0000-0000-000000000001', now()),
  ('41000000-0000-0000-0000-000000000021', '41000000-0000-0000-0000-000000000002', '{}', 'kakao', '16005550124', now()),
  ('41000000-0000-0000-0000-000000000022', '41000000-0000-0000-0000-000000000002', '{}', 'email', '41000000-0000-0000-0000-000000000002', now());

select is(
  public.unlink_kakao_identity_by_provider_id('not-a-kakao-id'),
  0,
  'invalid provider IDs are ignored'
);

set local role service_role;
select is(
  public.unlink_kakao_identity_by_provider_id('16005550123'),
  1,
  'matching Kakao identity is removed'
);
reset role;

select is(
  (select count(*)::integer from auth.identities where provider = 'email' and user_id = '41000000-0000-0000-0000-000000000001'),
  1,
  'company email identity remains linked'
);
select is(
  (select count(*)::integer from auth.users where id = '41000000-0000-0000-0000-000000000001'),
  1,
  'After auth user account is preserved'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000002', true);
select is(
  public.unlink_my_kakao_identity(),
  1,
  'member can remove their own Kakao identity'
);
reset role;
select is(
  (select count(*)::integer from auth.identities where provider = 'email' and user_id = '41000000-0000-0000-0000-000000000002'),
  1,
  'self-unlink preserves the company-email identity'
);

select * from finish();
rollback;
