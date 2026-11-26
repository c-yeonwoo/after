-- Pre-existing notes can contain a generated answer copied back by an old
-- profile editor. Mark provenance only on subsequent, attributable writes.
-- The markers contain section IDs and sentence positions only, never a second copy of the answer.
alter table public.profiles add column verified_intro_answer_ids text[] not null default '{}';

create function public.track_intro_answer_sources() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare draft jsonb; section text; raw text; previous_raw text; previous_public text; line record;
  can_attest boolean;
begin
  new.verified_intro_answer_ids:='{}';
  if tg_op='INSERT' or new.profile_story is null or new.account_state<>'active' then return new; end if;
  if new.profile_story is distinct from old.profile_story then
    select d.data into draft from profile_interview_drafts d where d.user_id=new.id
      and d.data->>'stage'='preview'
      and ((d.data->'story')-'publishedRevision')=(new.profile_story-'publishedRevision');
  end if;
  foreach section in array array['daily_life','getting_closer','conversation'] loop
    raw:=case section when 'daily_life' then new.evening_note when 'getting_closer' then new.known_as else new.topic_note end;
    previous_raw:=case section when 'daily_life' then old.evening_note when 'getting_closer' then old.known_as else old.topic_note end;
    if raw is null then continue; end if;
    select s->>'answer' into previous_public from jsonb_array_elements(old.profile_story->'sections') s
      where s->>'id'=section;
    can_attest:=draft->'publicIds' ? ('answer:'||section) and draft->'answers'->>section=raw;
    for line in select btrim(words) as words,ord from regexp_split_to_table(raw,'[.!。！\n]+')
        with ordinality lines(words,ord) where char_length(btrim(words))>=5 loop
      -- Moving an authored sentence keeps it authored. Editing its neighbor does
      -- not turn an untouched model-generated sentence into a member quotation.
      if exists(select 1 from regexp_split_to_table(previous_raw,'[.!。！\n]+') with ordinality prev(words,ord)
           where btrim(prev.words)=line.words and (section||':'||prev.ord)=any(old.verified_intro_answer_ids))
        or (can_attest and not exists(select 1 from regexp_split_to_table(
             concat_ws(E'\n',previous_raw,previous_public,old.intro,old.headline),'[.!。！\n]+') prior(words)
           where btrim(prior.words)=regexp_replace(line.words,'^((저는|저도|전|사실|음)[, ]+)+','')
              or btrim(prior.words)=line.words)) then
        new.verified_intro_answer_ids:=array_append(new.verified_intro_answer_ids,section||':'||line.ord);
      end if;
    end loop;
  end loop;
  return new;
end $$;
revoke all on function public.track_intro_answer_sources() from public,anon,authenticated;
-- Runs after the publication trigger has removed unapproved source notes.
create trigger profiles_track_intro_authorship before insert or update of profile_story,
  evening_note,known_as,topic_note,account_state,verified_intro_answer_ids on public.profiles
  for each row execute function public.track_intro_answer_sources();

-- Return at most one complete member-authored sentence, still present in the
-- same published answer. Never return a draft, a private review, or a raw note.
create or replace function public.intro_answer_excerpt(peer public.profiles, signal text, headline_only boolean)
returns text language sql immutable set search_path=public,pg_temp as $$
  with topic as (
    -- Require the preference to attach to its own verb, rather than e.g.
    -- treating “카페 옆 헬스장을 좋아해요” as an endorsement of a coffee date.
    select case when signal in ('함께 걷기','산책') then
        '(걸어요|걷기|걷는 (걸|게|시간이|시간을)|산책(을|이|도)?( 하는 (걸|게)|하는 (걸|게))?)'
      when signal='짧게 커피' then
        '(커피(를|가|도)?( 한 잔)?( (마시는|나누는) (걸|게|시간이|시간을))?|카페(를|가|에|도)?( 자주)?)'
      when signal='식사하며 대화' then
        '((식사|밥|저녁)(를|을|이|가|도)?( (먹는|나누는) (걸|게|시간이|시간을))?|맛집(을|이|도|에)?)'
      when signal='활동이나 체험' then
        '((보드게임|공방|클라이밍|볼링|원데이 클래스|체험)(을|를|이|가|에|도)?( (하는|해보는) (걸|게))?)'
      when signal='영화·드라마' then '(영화|드라마|영화관|엔딩 크레디트)(을|를|에|이|가|도)?( 자주)?'
      when signal='음악' then '(노래|콘서트|공연|음악)(을|를|에|이|가|도)?( 자주)?'
      when signal='여행' then '(여행|기차 여행|골목길)(을|를|에|이|가|도)?( 자주)?'
      when signal='음식' then '(맛집|빵집|요리)(을|를|에|이|가|도)?( 자주)?'
      when signal='운동' then '(운동|러닝|클라이밍|수영)(을|를|이|가|도)?'
    end as pattern
  ), approved as (
    select s.value->>'answer' as published,
      case s.value->>'id' when 'getting_closer' then peer.known_as
        when 'daily_life' then peer.evening_note when 'conversation' then peer.topic_note end as authored,
      s.value->>'id' as section,s.value->>'id'='getting_closer' as about_meeting,s.ord
    from jsonb_array_elements(case when jsonb_typeof(peer.profile_story->'sections')='array'
      then peer.profile_story->'sections' else '[]'::jsonb end) with ordinality s(value,ord)
    where peer.profile_story->>'version'='3'
  )
  select btrim(line.words) from approved a cross join topic
    cross join lateral regexp_split_to_table(a.published,'[.!。！\n]+') with ordinality line(words,ord)
    cross join lateral (select '(^|[[:space:]])'||topic.pattern||
      '[[:space:]]*(좋아해요|좋아요|편해요|즐겨요|좋아합니다|즐깁니다|가요|싶어요)$' as ending) form
  where char_length(btrim(line.words)) between 6 and 48 and (
      btrim(line.words) ~ form.ending
      or (signal in ('함께 걷기','산책') and btrim(line.words) ~ '(같이|함께|나란히|따라|천천히|느긋하게) 걸어요$')
    )
    -- Unknown marked subjects (“선배님은”, “엄마가”) can describe somebody
    -- else. Only first-person and familiar time/adverbial markers are safe.
    and not exists(select 1 from regexp_split_to_table(
      regexp_replace(btrim(line.words),form.ending,''),'[[:space:],]+') prefix(word)
      where word ~ '(은|는|이|가|도|께서|께서는|님|씨)$' and word !~ '^(저는|나는|제가|내가|저도|나도|같이|둘이|처음엔|((처음|주말|평일|요즘|평소|저녁|퇴근길)에?(는|은)))$')
    and line.words !~ '(싫|않|아니|별로|못|안[[:space:]]|없|대신|말고|빼고|제외|보다|지만|는데|반면|부담|피하|친구|동료|언니|오빠|동생|가족|부모|상대[는가]|그분|그녀|그는|혼자만|혼자서만|혼자일 때만|다고|다던|라는|[“”‘’"?？@:/0-9])'
    and (not headline_only or btrim(line.words)=btrim(peer.headline,' .!。！'))
    and exists(select 1 from regexp_split_to_table(a.authored,'[.!。！\n]+') with ordinality raw(words,ord)
      where (a.section||':'||raw.ord)=any(peer.verified_intro_answer_ids) and (btrim(raw.words)=btrim(line.words)
         or regexp_replace(btrim(raw.words),'^((저는|저도|전|사실|음)[, ]+)+','')=btrim(line.words)))
  order by a.about_meeting desc,a.ord,line.ord limit 1
$$;
revoke all on function public.intro_answer_excerpt(public.profiles,text,boolean) from public,anon,authenticated;

create or replace function public.intro_reason_evidence(p_peer uuid,p_curated text)
returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare n record; pref text; pref_source text; quote text; origin text; detail text;
  peer profiles; headline_only boolean; excerpt text; date_signal text;
begin
  select * into n from intro_reading_note(p_peer,p_curated);
  if n.reason is null then return null; end if;
  select choice,source into pref,pref_source from effective_intro_priority(auth.uid());
  select * into strict peer from profiles where id=p_peer;
  -- A closed, historical introduction does not unlock a new teaser.
  headline_only := my_gender()='male' and not exists(
    select 1 from intros where male_id=auth.uid() and female_id=p_peer and closed_at is null
  );
  if feedback_intro_reason(p_peer) is not null then
    origin:='priority';
    quote:=case pref when 'walk' then '함께 걷기' when 'coffee' then '짧게 커피' when 'meal' then '식사하며 대화' when 'activity' then '활동이나 체험' end;
    -- Old profiles used interest tags instead of explicit first-date answers.
    if pref='walk' and not coalesce(peer.profile_public_signals->'first_date' ? quote,false) then
      quote:='산책'; detail:='상대가 공개한 관심사';
    else detail:='상대가 고른 첫 만남'; end if;
  elsif nullif(btrim(p_curated),'') is not null then
    origin:='curated'; detail:='운영 매니저가 두 프로필을 검토해 남긴 소개예요.';
  elsif cardinality(n.shared)>0 then
    origin:='shared';
    select item into quote from unnest(n.shared) with ordinality as topics(item,ord)
     order by exists(select 1 from intro_signal_discounts d where d.member_id=auth.uid() and d.signal=item),ord limit 1;
    -- Prefer a concrete piece of a shared first-date answer over a generic tag.
    -- A member's explicit discount always takes precedence.
    select s.item,matched.words into date_signal,excerpt
      from unnest(n.shared) with ordinality as s(item,ord)
      cross join lateral (select intro_answer_excerpt(peer,s.item,headline_only) as words) matched
     where s.item in ('함께 걷기','짧게 커피','식사하며 대화','활동이나 체험')
       and not exists(select 1 from intro_signal_discounts d where d.member_id=auth.uid() and d.signal=s.item)
       and matched.words is not null
     order by s.ord limit 1;
    quote:=coalesce(date_signal,quote);
    detail:='두 사람의 공개 프로필에서 겹친 답';
  elsif peer.profile_public_signals->'first_date' ? '함께 걷기' then
    origin:='public'; quote:='함께 걷기'; detail:='상대가 고른 첫 만남';
  elsif peer.profile_public_signals->'first_date' ? '짧게 커피' then
    origin:='public'; quote:='짧게 커피'; detail:='상대가 고른 첫 만남';
  else
    origin:='selection'; detail:='이번 소개에는 별도로 기록된 공통점이 없어요.';
  end if;
  if origin in ('priority','shared','public') and excerpt is null then
    excerpt:=intro_answer_excerpt(peer,quote,headline_only);
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'priority_origin',case when origin='priority' then pref_source end,
    'peer_excerpt',excerpt)) || jsonb_build_object('reason',case when origin='selection' then '이번에 소개할 분이에요. 프로필에서 직접 알아보세요.' when origin='shared' then format('두 분의 프로필에서 ‘%s’라는 공통점을 찾았어요.',quote) else n.reason end,
    'source',origin,'label',detail,'quote',quote,'discounted',exists(select 1 from intro_signal_discounts d where d.member_id=auth.uid() and d.signal=quote));
end $$;
revoke all on function public.intro_reason_evidence(uuid,text) from public,anon,authenticated;
