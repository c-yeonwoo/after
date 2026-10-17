-- hub_id is the member's work zone, not a public service-wide location label.
-- Candidate queries already scope by hub_id. Enforce the same boundary for
-- manual curation and service-role writes as well, before a pair is persisted.
comment on column public.profiles.hub_id is
  '회원이 확인한 직장 지역(zone). 새 후보와 소개는 같은 hub_id 안에서만 연결한다.';

create function public.guard_pair_work_zone() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_first uuid;
  v_second uuid;
begin
  if tg_table_name = 'affinities' then
    v_first := new.from_id;
    v_second := new.to_id;
  else
    v_first := new.male_id;
    v_second := new.female_id;
  end if;

  if exists (
    select 1 from public.profiles a join public.profiles b on b.id = v_second
     where a.id = v_first and a.hub_id <> b.hub_id
  ) then
    raise exception 'different work zones' using errcode = '23514';
  end if;
  return new;
end $$;

revoke all on function public.guard_pair_work_zone() from public, anon, authenticated;

create trigger guard_affinity_work_zone
  before insert or update of from_id, to_id on public.affinities
  for each row execute function public.guard_pair_work_zone();

create trigger guard_queue_work_zone
  before insert or update of male_id, female_id on public.intro_queue
  for each row execute function public.guard_pair_work_zone();

create trigger guard_intro_work_zone
  before insert or update of male_id, female_id on public.intros
  for each row execute function public.guard_pair_work_zone();
