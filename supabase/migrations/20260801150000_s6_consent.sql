-- S6 — 가입 동의 기록 (PRD 완료조건 266)
--
-- 개인정보를 수집하는 서비스는 "동의를 받았다"를 증빙할 수 있어야 한다.
-- 클라이언트 체크박스 상태는 증빙이 아니므로 서버에 시각을 남긴다.
--
-- 약관 버전을 함께 남긴다 — 약관이 개정되면 재동의가 필요한지 판단하려면
-- "무엇에 동의했는지"를 알아야 한다. 시각만으로는 소급 추정이 불가능하다.

alter table profiles
  add column terms_agreed_at      timestamptz,
  add column privacy_agreed_at    timestamptz,
  add column agreed_policy_version text;

comment on column profiles.terms_agreed_at is
  '이용약관 동의 시각. 서버만 쓴다(record_consent).';
comment on column profiles.privacy_agreed_at is
  '개인정보 수집·이용 동의 시각. 서버만 쓴다(record_consent).';
comment on column profiles.agreed_policy_version is
  '동의 당시 약관·처리방침 버전. 개정 시 재동의 필요 판단용.';

-- 동의는 필수 두 건을 한 번에 기록한다. 둘 중 하나만 동의하는 상태를
-- 만들지 않는다 — 그런 상태로는 서비스를 제공할 수 없기 때문이다.
create or replace function record_consent(p_policy_version text) returns profiles
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_profile profiles;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if coalesce(trim(p_policy_version), '') = '' then
    raise exception 'policy version required' using errcode = '22023';
  end if;

  update profiles
     set terms_agreed_at       = coalesce(terms_agreed_at, now()),
         privacy_agreed_at     = coalesce(privacy_agreed_at, now()),
         agreed_policy_version = p_policy_version
   where id = v_uid
  returning * into v_profile;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  insert into events (user_id, name, props)
  values (v_uid, 'consent_recorded', jsonb_build_object('policy_version', p_policy_version));

  return v_profile;
end $$;

revoke execute on function record_consent(text) from public, anon, authenticated;
grant execute on function record_consent(text) to authenticated;

-- ─────────────── 자격 조건에 동의 여부 추가 ───────────────
-- 동의하지 않은 계정은 매칭 대상이 되지 않는다.
--
-- `create or replace view` 를 쓸 수 없다: 위에서 profiles 에 컬럼 3개를 추가했고
-- 이 뷰는 `select *` 라 출력 컬럼 목록이 바뀌기 때문이다(Postgres 가 거부한다).
-- drop 후 재생성하되 **`security_invoker = true` 를 반드시 유지한다** — 이 옵션이
-- 없으면 뷰가 소유자 권한으로 돌아 호출자의 RLS 를 우회한다.
drop view if exists eligible_profiles;

create view eligible_profiles with (security_invoker = true) as
  select * from profiles
   where email_verified_at is not null
     and account_state = 'active'
     and onboarding_step = 7
     and terms_agreed_at is not null
     and privacy_agreed_at is not null;

-- 버그 3 재발 방지: 같은 자격 조건이 뷰와 RLS 정책 두 곳에 따로 적혀 있어서
-- 갈라졌던 사고가 이미 있었다. 뷰에만 동의 조건을 넣으면 정확히 같은 사고가
-- 반복되므로(동의 안 한 남성이 여성에게 평가 대상으로 노출됨) 두 정책도 함께 고친다.
drop policy if exists profiles_select_counterpart on profiles;
create policy profiles_select_counterpart on profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from intros i
       where (i.male_id = auth.uid() and i.female_id = profiles.id)
          or (i.female_id = auth.uid() and i.male_id = profiles.id)
    )
    or (
      my_gender() = 'female'
      and profiles.gender = 'male'
      and profiles.email_verified_at is not null
      and profiles.account_state = 'active'
      and profiles.onboarding_step = 7
      and profiles.terms_agreed_at is not null
      and profiles.privacy_agreed_at is not null
      and profiles.hub_id = my_hub_id()
      and not is_excluded(auth.uid(), profiles.id)
    )
  );

drop policy if exists affinities_insert_female_only on affinities;
create policy affinities_insert_female_only on affinities
  for insert with check (
    from_id = auth.uid()
    and my_gender() = 'female'
    and exists (
      select 1 from profiles t
       where t.id = affinities.to_id
         and t.gender = 'male'
         and t.email_verified_at is not null
         and t.account_state = 'active'
         and t.onboarding_step = 7
         and t.terms_agreed_at is not null
         and t.privacy_agreed_at is not null
         and t.hub_id = my_hub_id()
    )
    and not is_excluded(auth.uid(), affinities.to_id)
  );
