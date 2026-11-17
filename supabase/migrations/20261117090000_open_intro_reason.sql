-- Compute the viewer's note on read. Only an approved shared reason belongs on intros.
-- Callers must already have selected an openable queue card or the viewer's open introduction.
create or replace function public.intro_reading_note(p_candidate uuid, p_curated text)
returns table(shared text[], reason text)
language sql stable set search_path = public, pg_temp as $$
  select common.items,
         coalesce(public.feedback_intro_reason(peer.id), nullif(btrim(p_curated),''),
           case when cardinality(common.items)>0 then format('두 분의 프로필에서 ‘%s’라는 공통점을 찾았어요.',common.items[1])
                when peer.profile_public_signals->'first_date' ? '함께 걷기' then '처음 만날 때 나란히 걷는 자리가 편하다고 한 분이에요.'
                when peer.profile_public_signals->'first_date' ? '짧게 커피' then '처음엔 커피 한 잔으로 가볍게 알아가고 싶다는 분이에요.'
                else '운영팀이 두 분의 프로필을 살펴보고 이번 소개로 골랐어요.' end)
    from public.profiles me
    join public.profiles peer on peer.id=p_candidate
    cross join lateral (
      select array(
        select distinct topic from (
          select opt.value as topic
            from unnest(array['first_date','topics','rhythm']) k
            cross join lateral jsonb_array_elements_text(peer.profile_public_signals->k) opt(value)
           where (me.profile_public_signals->k) ? opt.value
          union all
          select t from unnest(peer.topics) t
           where me.profile_story is null and peer.profile_story is null and t=any(me.topics)
          union all
          select t from unnest(peer.interests) t
           where me.profile_story is null and peer.profile_story is null and t=any(me.interests)
        ) visible where btrim(topic)<>'' order by topic
      ) as items
    ) common
   where me.id=auth.uid()
$$;
revoke all on function public.intro_reading_note(uuid,text) from public, anon, authenticated;

create or replace function public.intro_teaser()
returns table(age integer, job text, headline text, shared text[], reason text, delivered integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null then
    raise exception 'unauthenticated' using errcode='28000';
  end if;
  if my_gender() <> 'male' then
    raise exception 'only male users receive introductions' using errcode='42501';
  end if;

  if exists (select 1 from intros i where i.male_id=viewer and i.closed_at is null) then
    return;
  end if;

  return query
    select date_part('year',age(current_date,peer.birth))::integer, peer.job, peer.headline,
           note.shared, note.reason,
           (select count(*)::integer from intro_queue q where q.male_id=viewer
               and q.opened_at is null and q.delivered_at is not null and q.expires_at>now())
      from next_openable_card(viewer) card
      join profiles peer on peer.id=card.female_id
      cross join lateral public.intro_reading_note(peer.id,card.reason) note;
end $$;

create or replace function public.home_state_v2() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  state jsonb := public.home_state_v2_before_intro_reason();
  candidate uuid := (state->'candidate'->>'id')::uuid;
  reason text;
begin
  if state->>'primary_state'='intro_delivered' and state->'me'->>'gender'='male' then
    select t.reason into reason from public.intro_teaser() t;
  elsif state->>'primary_state'='intro_available' then
    if state->'me'->>'gender'='male' then
      select note.reason into reason
        from public.intros i
        cross join lateral public.intro_reading_note(i.female_id,i.reason) note
       where i.male_id=auth.uid() and i.female_id=candidate and i.closed_at is null;
    else
      reason := public.feedback_intro_reason(candidate);
    end if;
  end if;
  return state || jsonb_build_object('viewer_intro_reason',reason);
end $$;
