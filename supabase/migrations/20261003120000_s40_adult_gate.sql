-- S40 — 만 19세 이상 가입을 서버에서 강제한다.
--
-- 화면의 disabled 버튼만으로는 REST 호출을 막을 수 없다. 생년월일을 직접 쓰는
-- 우회도 DB 트리거에서 거절한다. 탈퇴 계정은 완료 단계를 유지한 채 birth를
-- 지우므로, birth 자체를 필수로 강제하지는 않는다.

create or replace function enforce_profile_adult_age() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  if new.birth is not null
     and extract(year from age(current_date, new.birth)) < 19 then
    raise exception 'must be at least 19 years old' using errcode = '23514';
  end if;

  return new;
end $$;

drop trigger if exists profiles_adult_age on profiles;
create trigger profiles_adult_age
  before insert or update of birth, onboarding_step on profiles
  for each row execute function enforce_profile_adult_age();

comment on function enforce_profile_adult_age() is
  '생년월일이 있는 프로필은 만 19세 미만 값으로 저장할 수 없다.';

revoke all on function enforce_profile_adult_age() from public, anon, authenticated;
