-- S17b — 회원 목록에 "쉬는 중" 필터
--
-- 대시보드의 숫자를 눌러 그 목록으로 넘어가게 만들면서 필요해졌다. 지표는
-- 있는데 그 모집단을 목록에서 못 고르면 숫자를 눌러도 갈 곳이 없다.
--
-- paused_at 은 nullable timestamptz 라 boolean 으로 받는다 — 화면이 URL 에
-- 담아야 하는 값이라 시각을 주고받을 이유가 없다.

drop function if exists admin_members(gender, account_state, text, text);

create function admin_members(
  p_gender gender         default null,
  p_state  account_state  default null,
  p_hub    text           default null,
  p_query  text           default null,
  p_paused boolean        default null
) returns table (
  id                      uuid,
  name                    text,
  gender                  gender,
  hub_id                  text,
  company_email           text,
  account_state           account_state,
  role                    text,
  onboarding_step         smallint,
  paused_at               timestamptz,
  photo_url               text,
  created_at              timestamptz,
  unused_tickets          bigint,
  has_active_meeting      boolean,
  pending_reports_against bigint
)
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select p.id, p.name, p.gender, p.hub_id, p.company_email,
         p.account_state, p.role, p.onboarding_step, p.paused_at,
         p.photo_url, p.created_at,
         (select count(*) from tickets t
           where t.user_id = p.id and t.state = 'unused'),
         exists (select 1 from meetings m
                   join intros i on i.id = m.intro_id
                  where m.cancelled_at is null and m.completed_at is null
                    and (i.male_id = p.id or i.female_id = p.id)),
         (select count(*) from content_reports r
           where r.accused_id = p.id and r.state = 'pending')
    from profiles p
   where (p_gender is null or p.gender        = p_gender)
     and (p_state  is null or p.account_state = p_state)
     and (p_hub    is null or p.hub_id        = p_hub)
     and (p_paused is null or (p.paused_at is not null) = p_paused)
     and (p_query  is null or btrim(p_query) = ''
          or p.name          ilike '%' || btrim(p_query) || '%'
          or p.company_email ilike '%' || btrim(p_query) || '%')
   order by p.created_at desc;
end $$;

comment on function admin_members(gender, account_state, text, text, boolean) is
  '운영자 회원 목록. 티켓·만남·미처리 신고 수를 함께 낸다(화면 N+1 방지).';

revoke all on function admin_members(gender, account_state, text, text, boolean)
  from public, anon;
grant execute on function admin_members(gender, account_state, text, text, boolean)
  to authenticated;
