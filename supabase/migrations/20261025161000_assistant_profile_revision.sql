-- A separate, dark-launched editing contract. Generated text is private until approval.
alter table public.app_settings add column assistant_profile_edit_enabled boolean not null default false;

create table public.profile_revision_drafts (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  instruction text not null check (length(instruction) between 3 and 1000),
  source_document jsonb not null,
  source_revision timestamptz not null,
  source_fingerprint text not null,
  before_story jsonb,
  after_story jsonb,
  note text check (length(note) <= 300),
  state text not null default 'pending' check (state in ('pending','ready','approved','discarded','failed')),
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  approved_at timestamptz
);
create index profile_revision_drafts_owner on public.profile_revision_drafts(owner_id,created_at desc);
alter table public.profile_revision_drafts enable row level security;
revoke all on public.profile_revision_drafts from public,anon,authenticated;
grant all on public.profile_revision_drafts to service_role;

create function public.profile_revision_document(p public.profiles) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
  select jsonb_build_object('headline',p.headline,'intro',p.intro,'profile_story',p.profile_story)
$$;
revoke all on function public.profile_revision_document(public.profiles) from public,anon,authenticated;

create function public.valid_profile_revision_story(p_story jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare s jsonb; ids text[]:='{}'; q text;
begin
  if p_story is null or jsonb_typeof(p_story)<>'object' or p_story->>'version' is distinct from '3'
    or jsonb_typeof(p_story->'headline') is distinct from 'string'
    or length(btrim(p_story->>'headline')) not between 3 and 35
    or jsonb_typeof(p_story->'summary') is distinct from 'string'
    or length(btrim(p_story->>'summary')) not between 5 and 300
    or jsonb_typeof(p_story->'sections') is distinct from 'array'
    or jsonb_typeof(p_story->'conversationHooks') is distinct from 'array'
    or coalesce(p_story->>'publishedRevision','') !~ '^[0-9]{1,12}$'
    or octet_length(p_story::text)>6000 then return false; end if;
  if jsonb_array_length(p_story->'sections') not between 1 and 3
    or jsonb_array_length(p_story->'conversationHooks')>2 then return false; end if;
  for s in select value from jsonb_array_elements(p_story->'sections') loop
    q:=case s->>'id' when 'daily_life' then '퇴근 후에는 어떻게 보내세요?'
      when 'getting_closer' then '어떤 만남에서 편해지나요?'
      when 'conversation' then '만나면 어떤 이야기를 나누고 싶나요?' end;
    if q is null or s->>'id'=any(ids) or s->>'question' is distinct from q
      or s->>'questionId' is distinct from (s->>'id')||'_v1'
      or s->>'questionVersion' is distinct from '1'
      or jsonb_typeof(s->'answer') is distinct from 'string'
      or length(btrim(s->>'answer')) not between 5 and 240 then return false; end if;
    ids:=array_append(ids,s->>'id');
  end loop;
  if exists(select 1 from jsonb_array_elements(p_story->'conversationHooks') h
    where jsonb_typeof(h)<>'string' or length(h#>>'{}')>100) then return false; end if;
  return p_story::text !~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}|(\+?82[- .]?)?0?1[016789][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}|https?://[^[:space:]]+';
end $$;
revoke all on function public.valid_profile_revision_story(jsonb) from public,anon,authenticated;

create function public.my_profile_revision(p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); d public.profile_revision_drafts; enabled boolean;
begin
  select assistant_profile_edit_enabled into enabled from app_settings where id;
  select * into d from profile_revision_drafts where owner_id=u and (p_id is null or id=p_id)
    and expires_at>now()-interval '7 days' order by created_at desc limit 1;
  return jsonb_build_object('enabled',coalesce(enabled,false),'draft',case when d.id is null then null else
    jsonb_build_object('id',d.id,'instruction',d.instruction,'state',case
      when d.state='pending' and d.created_at<now()-interval '2 minutes' then 'failed'
      when d.state='ready' and d.expires_at<=now() then 'expired' else d.state end,
      'before',d.before_story,'after',case when enabled and d.state in ('ready','approved') then d.after_story end,
      'note',case when enabled then d.note end,'createdAt',d.created_at,'expiresAt',d.expires_at,'approvedAt',d.approved_at) end);
end $$;
revoke all on function public.my_profile_revision(uuid) from public,anon;
grant execute on function public.my_profile_revision(uuid) to authenticated;

create function public.begin_profile_revision(p_id uuid,p_instruction text,p_consent boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); p public.profiles; d public.profile_revision_drafts; doc jsonb;
begin
  -- Common lock order: profile, then draft. Parallel generation and approval cannot race.
  select * into p from profiles where id=u and account_state='active' for update;
  if not found or coalesce((select assistant_profile_edit_enabled from app_settings where id),false) is not true
    or p_consent is distinct from true then raise exception 'disabled or consent required' using errcode='PT403'; end if;
  if p_id is null or p_instruction is null or length(btrim(p_instruction)) not between 3 and 1000
    or p_instruction ~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}|(\+?82[- .]?)?0?1[016789][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}|https?://[^[:space:]]+'
    then raise exception 'invalid instruction' using errcode='22023'; end if;
  select * into d from profile_revision_drafts where id=p_id;
  if found then
    if d.owner_id<>u or d.instruction<>btrim(p_instruction) then raise exception 'request changed' using errcode='PT409'; end if;
    return jsonb_build_object('created',false,'state',case when d.state='pending' and d.created_at<now()-interval '2 minutes' then 'failed' else d.state end);
  end if;
  if exists(select 1 from profile_revision_drafts where owner_id=u and state='pending' and created_at>now()-interval '2 minutes')
    then raise exception 'generation in progress' using errcode='PT409'; end if;
  -- Requests also count before provider reservation; aborted requests cannot flood private storage.
  if (select count(*) from profile_revision_drafts where owner_id=u and created_at>now()-interval '24 hours')>=5
    then raise exception 'daily limit' using errcode='PT429'; end if;
  update profile_revision_drafts set state='failed' where owner_id=u and state='pending';
  doc:=public.profile_revision_document(p);
  insert into profile_revision_drafts(id,owner_id,instruction,source_document,source_revision,source_fingerprint)
    values(p_id,u,btrim(p_instruction),doc,p.updated_at,encode(sha256(convert_to(doc::text,'UTF8')),'hex'));
  return jsonb_build_object('created',true,'source',doc);
end $$;
revoke all on function public.begin_profile_revision(uuid,text,boolean) from public,anon;
grant execute on function public.begin_profile_revision(uuid,text,boolean) to authenticated;

create function public.store_profile_revision(p_owner uuid,p_id uuid,p_before jsonb,p_after jsonb,p_note text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.profiles; d public.profile_revision_drafts; doc jsonb;
begin
  select * into p from profiles where id=p_owner and account_state='active' and onboarding_step>=7 for update;
  if not found then return false; end if;
  select * into d from profile_revision_drafts where id=p_id and owner_id=p_owner for update;
  if d.id is null or d.state<>'pending' or d.created_at<now()-interval '2 minutes'
    or coalesce((select assistant_profile_edit_enabled from app_settings where id),false) is not true then return false; end if;
  doc:=public.profile_revision_document(p);
  if doc is distinct from d.source_document or p.updated_at is distinct from d.source_revision
    or encode(sha256(convert_to(doc::text,'UTF8')),'hex')<>d.source_fingerprint
    or not public.valid_profile_revision_story(p_before) or not public.valid_profile_revision_story(p_after)
    or p_note is null or length(p_note) not between 3 and 300 then
    update profile_revision_drafts set state='failed' where id=p_id; return false; end if;
  update profile_revision_drafts set before_story=p_before,after_story=p_after,note=p_note,state='ready' where id=p_id;
  return true;
end $$;
revoke all on function public.store_profile_revision(uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.store_profile_revision(uuid,uuid,jsonb,jsonb,text) to service_role;

create function public.fail_profile_revision(p_owner uuid,p_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update profile_revision_drafts set state='failed' where id=p_id and owner_id=p_owner and state='pending';
  return found;
end $$;
revoke all on function public.fail_profile_revision(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fail_profile_revision(uuid,uuid) to service_role;

-- Preserve the original interview approval gate. The only extra publication
-- path is the exact candidate approved in this transaction by its own member.
create or replace function public.approve_profile_story_sources() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_data jsonb;
begin
  if new.profile_story is null or new.profile_story is not distinct from old.profile_story then return new; end if;
  if auth.uid()=new.id and coalesce((select assistant_profile_edit_enabled from app_settings where id),false)
    and exists(select 1 from profile_revision_drafts d where d.owner_id=new.id and d.state='approved'
      and d.approved_at=transaction_timestamp() and d.after_story=new.profile_story
      and d.source_document=public.profile_revision_document(old)) then
    new.profile_preferences:=old.profile_preferences;
    return new;
  end if;
  select data into v_data from public.profile_interview_drafts
    where user_id=new.id and data->>'version'='3' and data->>'stage'='preview';
  if v_data is null then raise exception 'approved interview draft required' using errcode='22023'; end if;
  if jsonb_typeof(v_data->'publicIds')<>'array' then raise exception 'public scope required' using errcode='22023'; end if;
  new.profile_preferences:=jsonb_build_object('version',1,'choices',coalesce(v_data->'choices','{}'::jsonb),'choiceCustom',coalesce(v_data->'choiceCustom','{}'::jsonb));
  if not (v_data->'publicIds' ? 'answer:daily_life') then new.evening_note:=null; end if;
  if not (v_data->'publicIds' ? 'answer:getting_closer') then new.known_as:=null; end if;
  if not (v_data->'publicIds' ? 'answer:conversation') then new.topic_note:=null; end if;
  return new;
end $$;
revoke all on function public.approve_profile_story_sources() from public,anon,authenticated;

create function public.approve_profile_revision(p_id uuid,p_approved boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); p public.profiles; d public.profile_revision_drafts; doc jsonb; story jsonb;
begin
  select * into p from profiles where id=u and account_state='active' for update;
  if not found or coalesce((select assistant_profile_edit_enabled from app_settings where id),false) is not true
    then raise exception 'feature unavailable' using errcode='PT403'; end if;
  select * into d from profile_revision_drafts where id=p_id and owner_id=u for update;
  if d.id is null or p_approved is null then raise exception 'draft unavailable' using errcode='PT409'; end if;
  -- A lost HTTP response is recovered by the same receipt, never another publication.
  if d.state='approved' and p_approved then
    return jsonb_build_object('id',d.id,'state','approved','appliedAt',d.approved_at,'reused',true); end if;
  if d.state='discarded' and not p_approved then
    return jsonb_build_object('id',d.id,'state','discarded','reused',true); end if;
  if d.state<>'ready' or d.expires_at<=now() then raise exception 'draft expired or unavailable' using errcode='PT409'; end if;
  if not p_approved then
    update profile_revision_drafts set state='discarded',after_story=null,note=null where id=d.id;
    return jsonb_build_object('id',d.id,'state','discarded'); end if;
  doc:=public.profile_revision_document(p);
  if doc is distinct from d.source_document or p.updated_at is distinct from d.source_revision
    or encode(sha256(convert_to(doc::text,'UTF8')),'hex')<>d.source_fingerprint
    then raise exception 'profile changed; create a fresh draft' using errcode='PT409'; end if;
  if not public.valid_profile_revision_story(d.after_story) then raise exception 'invalid draft' using errcode='22023'; end if;
  story:=jsonb_set(d.after_story,'{publishedRevision}',to_jsonb(coalesce((p.profile_story->>'publishedRevision')::bigint,0)+1));
  update profile_revision_drafts set state='approved',approved_at=now(),after_story=story where id=d.id;
  -- All visible copy moves together. Existing raw answers, private preferences,
  -- verification/photo status, photos, eligibility, payments and matches are untouched.
  update profiles set profile_story=story,headline=story->>'headline',intro=story->>'summary' where id=u;
  return jsonb_build_object('id',d.id,'state','approved','appliedAt',now(),'reused',false);
end $$;
revoke all on function public.approve_profile_revision(uuid,boolean) from public,anon;
grant execute on function public.approve_profile_revision(uuid,boolean) to authenticated;

create function public.erase_inactive_profile_revision_drafts() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.account_state<>'active' then delete from profile_revision_drafts where owner_id=new.id; end if;
  return new;
end $$;
revoke all on function public.erase_inactive_profile_revision_drafts() from public,anon,authenticated;
create trigger profiles_erase_revision_drafts after update of account_state on public.profiles
  for each row execute function public.erase_inactive_profile_revision_drafts();

create function public.purge_profile_revision_drafts() returns void
language sql security definer set search_path=public,pg_temp as $$
  delete from profile_revision_drafts where expires_at<now()-interval '7 days'
    or owner_id in (select id from profiles where account_state<>'active')
$$;
revoke all on function public.purge_profile_revision_drafts() from public,anon,authenticated;
select cron.schedule('expire-profile-revision-drafts','31 * * * *',$$select public.purge_profile_revision_drafts()$$);
