begin;
select no_plan();

create function pg_temp.excerpt(signal text, approved text, own text, headline text default null, locked boolean default false)
returns text language sql as $$
  select public.intro_answer_excerpt(jsonb_populate_record(null::public.profiles,jsonb_build_object(
    'profile_story',jsonb_build_object('version',3,'sections',jsonb_build_array(jsonb_build_object('id','getting_closer','answer',approved))),
    'known_as',own,'headline',headline,'verified_intro_answer_ids',array['getting_closer:1'])),signal,locked)
$$;
select is(pg_temp.excerpt('짧게 커피','창가에서 커피 한 잔 나누는 걸 좋아해요.','저는 창가에서 커피 한 잔 나누는 걸 좋아해요.'),
  '창가에서 커피 한 잔 나누는 걸 좋아해요','a literal phrase survives removal of a conversational filler');
select is(pg_temp.excerpt('함께 걷기','하천을 따라 느긋하게 걷는 걸 좋아해요.','하천을 따라 느긋하게 걷는 걸 좋아해요.','우리 동네를 소개해요',true),
  null,'locked teaser cannot surface otherwise public interview text');
select is(pg_temp.excerpt('함께 걷기','하천을 따라 느긋하게 걷는 걸 좋아해요.','하천을 따라 느긋하게 걷는 걸 좋아해요.','하천을 따라 느긋하게 걷는 걸 좋아해요',true),
  '하천을 따라 느긋하게 걷는 걸 좋아해요','locked teaser can quote its already-visible headline when authored');
select is(pg_temp.excerpt('식사하며 대화','둘이 저녁을 먹는 걸 좋아해요.','둘이 저녁을 먹는 걸 좋아해요.'),'둘이 저녁을 먹는 걸 좋아해요','a shared meal');
select is(pg_temp.excerpt('활동이나 체험','저는 보드게임을 즐겨요.','저는 보드게임을 즐겨요.'),'저는 보드게임을 즐겨요','an activity');
select is(pg_temp.excerpt('짧게 커피','집 앞 카페가 편해요.','강변에서 커피를 좋아해요.'),null,'model rewrite is not a member quote');
select is(pg_temp.excerpt('짧게 커피','집 앞 카페가 편해요.',null),null,'missing original cannot be inferred');
select is(pg_temp.excerpt('짧게 커피','교외에서 커피가 좋아요.','저는 집보다 교외에서 커피가 좋아요.'),null,'a qualification cannot be removed');
select is(pg_temp.excerpt('짧게 커피',s,s),null,'avoid attributing: '||s) from unnest(array[
  '저희 엄마도 커피를 좋아해요.', '저희 엄마는 커피를 좋아해요.', '실장님께서는 커피를 좋아해요.', '도윤이가 커피를 좋아해요.', '동료는 커피를 좋아해요.', '커피를 좋아해요?', '카페 옆 헬스장을 좋아해요.', '커피 말고 차가 좋아요.',
  '산책하는 게 좋아요.', '혼자서만 커피를 즐겨요.'
]) s;
select ok(not has_function_privilege('authenticated','public.intro_answer_excerpt(public.profiles,text,boolean)','execute'),
  'no new client entry point for probing a profile');
select * from finish();
rollback;
