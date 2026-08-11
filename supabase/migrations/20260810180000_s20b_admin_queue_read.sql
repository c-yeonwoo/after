-- S20b — 큐 조회를 RPC 로
--
-- 큐레이션 화면만 PostgREST 직접 조회로 짰다가 이름이 비어 나왔다.
--
--     from('intro_queue').select('..., profiles!fk(name, photo_url)')
--     → profiles: null
--
-- intro_queue 는 운영자에게 열려 있지만 **profiles 는 아니다.** 임베드는 조인
-- 대상의 RLS 를 그대로 타므로 운영자가 임의 회원의 이름을 읽을 수 없다.
--
-- s16 부터 지켜온 규칙이 있었는데 여기서만 어겼다: "필요한 모양 그대로 서버에서
-- 만들어 내보낸다. 화면에서 조인해 세려면 테이블을 넓게 열어야 하고, 넓힌 정책은
-- 결국 사용자 쪽에서도 열린다." profiles 를 운영자에게 넓히는 대신 RPC 를 만든다.

create function admin_queue(p_male uuid)
  returns table (
    female_id    uuid,
    -- position 은 RETURNS TABLE 에서 예약어라 쓸 수 없다(테이블 컬럼명으로는 된다).
    queue_position integer,
    -- 큐에 담긴 사람도 눌러 프로필 전체를 봐야 한다(이미 세운 줄을 되짚는 일).
    -- admin_like_pool 과 같은 컬럼을 낸다 — 두 목록이 같은 미리보기를 쓴다.
    name         text,
    photo_url    text,
    photo_state  photo_state,
    birth        date,
    job          text,
    mbti         text,
    smoking      text,
    drinking     text,
    religion     text,
    hub_id       text,
    headline     text,
    intro        text,
    interests    text[],
    match_tags   text[],
    topics       text[],
    details      jsonb,
    delivered_at timestamptz,
    expires_at   timestamptz,
    note         text,
    curator_name text
  )
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select q.female_id, q.position, f.name, f.photo_url, f.photo_state, f.birth, f.job,
         f.mbti, f.smoking, f.drinking, f.religion, f.hub_id,
         f.headline, f.intro, f.interests, f.match_tags, f.topics, f.details,
         q.delivered_at, q.expires_at, q.note, c.name
    from intro_queue q
    join profiles f on f.id = q.female_id
    left join profiles c on c.id = q.curated_by
   where q.male_id = p_male
     and q.opened_at is null
   order by q.position;
end $$;

comment on function admin_queue(uuid) is
  '이 남성의 미열람 큐. 화면이 임베드로 조인하면 profiles RLS 에 막힌다.';

revoke all on function admin_queue(uuid) from public, anon;
grant execute on function admin_queue(uuid) to authenticated;
