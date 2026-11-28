begin;
-- Keep old PostgREST row shapes compatible while retiring the underlying field.
-- The owner has not authorized destruction of earlier answers. Move only those
-- values out of the API schema; no future write goes to this table.
lock table public.profiles, public.onboarding_drafts, public.profile_interview_drafts
  in share row exclusive mode;

create schema after_retired;
revoke all on schema after_retired from public, anon, authenticated, service_role;
create table after_retired.profile_religion (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  prior_value text not null
);
revoke all on after_retired.profile_religion from public, anon, authenticated, service_role;
alter table after_retired.profile_religion enable row level security;
insert into after_retired.profile_religion(user_id, prior_value)
select id, religion from public.profiles where religion is not null;
update public.profiles set religion=null where religion is not null;

create function after_retired.discard_profile_religion() returns trigger
language plpgsql set search_path='' as $$
begin
  new.religion := null;
  return new;
end
$$;
create trigger discard_profile_religion before insert or update of religion on public.profiles
for each row execute function after_retired.discard_profile_religion();
alter table public.profiles add constraint retired_religion_is_null check (religion is null);

-- A soft account withdrawal must erase the isolated value just like a hard deletion.
create function after_retired.erase_withdrawn_religion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from after_retired.profile_religion where user_id=new.id;
  return new;
end
$$;
create trigger erase_withdrawn_religion after update of account_state on public.profiles
for each row when (new.account_state='withdrawn')
execute function after_retired.erase_withdrawn_religion();

-- Surveyed legacy client payloads use basics.religion. Ignore the field in older
-- drafts without changing any unrelated answers or the optimistic-lock revision.
create function after_retired.clean_draft(data jsonb) returns jsonb
language sql immutable strict set search_path='' as $$
  select data - 'religion' #- '{basics,religion}' #- '{conditions,religion}';
$$;
-- There were no existing draft answers in the preflight. Abort atomically if one
-- appears before release rather than deleting an existing answer without approval.
do $$
begin
  if exists (
    select 1 from (
      select data from public.onboarding_drafts
      union all
      select data from public.profile_interview_drafts
    ) d where nullif(d.data->>'religion','') is not null
          or nullif(d.data#>>'{basics,religion}','') is not null
          or nullif(d.data#>>'{conditions,religion}','') is not null
  ) then raise exception 'Existing draft answer needs a retention decision'; end if;
end $$;
update public.onboarding_drafts set data=after_retired.clean_draft(data)
where data is distinct from after_retired.clean_draft(data);
update public.profile_interview_drafts set data=after_retired.clean_draft(data)
where data is distinct from after_retired.clean_draft(data);

create function after_retired.discard_draft_religion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.data := after_retired.clean_draft(new.data);
  return new;
end
$$;
create trigger discard_draft_religion before insert or update of data on public.onboarding_drafts
for each row execute function after_retired.discard_draft_religion();
create trigger discard_draft_religion before insert or update of data on public.profile_interview_drafts
for each row execute function after_retired.discard_draft_religion();
revoke all on all functions in schema after_retired from public, anon, authenticated, service_role;
commit;
