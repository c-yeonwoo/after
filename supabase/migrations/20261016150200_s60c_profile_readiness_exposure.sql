-- 직접 조회하는 공개 프로필도 신규 후보 노출 자격을 동일하게 적용한다.
-- 이미 열린 소개·진행 중 약속의 상대 조회는 계속 허용한다.
create or replace view public.public_profiles as
select p.id, p.hub_id, p.name,
  case when p.birth is null then null else extract(year from age(p.birth))::int end as age,
  p.job, p.photo_url, p.mbti, p.smoking, p.drinking, p.religion,
  p.headline, p.intro, p.interests, p.match_tags, p.topics, p.details, p.photo_paths
from public.profiles p
where (p.id = auth.uid() or (
  not public.is_excluded(auth.uid(), p.id) and (
    exists (select 1 from public.intros i where i.closed_at is null
      and ((i.male_id = auth.uid() and i.female_id = p.id)
        or (i.female_id = auth.uid() and i.male_id = p.id)))
    or exists (select 1 from public.meetings m join public.intros i on i.id = m.intro_id
      where m.cancelled_at is null
        and ((i.male_id = auth.uid() and i.female_id = p.id)
          or (i.female_id = auth.uid() and i.male_id = p.id)))
    or (public.my_gender() = 'female' and p.gender = 'male'
        and (public.member_readiness(auth.uid())->>'ready')::boolean
        and public.is_eligible_candidate(p.id))
  )
)) and (p.id = auth.uid() or not public.carrier_identity_required()
  or public.my_carrier_adult_verified() or public.is_admin());
