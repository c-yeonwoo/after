-- Customer inquiries are separate from reports about another member.
-- Only vetted functions expose their contents; anon has no table access.
create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  category text not null check (category in ('account', 'introduction', 'payment', 'safety', 'other')),
  body text not null check (char_length(btrim(body)) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'answered')),
  response text check (response is null or char_length(btrim(response)) between 1 and 2000),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references public.profiles(id),
  constraint support_response_consistency check (
    (status = 'open' and response is null and responded_at is null and responded_by is null)
    or (status = 'answered' and response is not null and responded_at is not null and responded_by is not null)
  )
);

create index support_requests_user_recent on public.support_requests (user_id, created_at desc);
create index support_requests_open_recent on public.support_requests (created_at) where status = 'open';
alter table public.support_requests enable row level security;
revoke all on public.support_requests from public, anon, authenticated;
grant all on public.support_requests to service_role;

create function public.create_support_request(p_category text, p_body text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'login required' using errcode = '28000';
  end if;
  if p_category not in ('account', 'introduction', 'payment', 'safety', 'other')
     or p_category is null then
    raise exception 'invalid category' using errcode = '22023';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 10 and 2000 then
    raise exception 'message length must be 10..2000' using errcode = '22023';
  end if;
  if (select count(*) from public.support_requests
       where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  insert into public.support_requests (user_id, category, body)
  values (auth.uid(), p_category, btrim(p_body)) returning id into v_id;
  return v_id;
end $$;

create function public.my_support_requests()
returns table(id uuid, category text, body text, status text, response text,
              created_at timestamptz, responded_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.id, r.category, r.body, r.status, r.response, r.created_at, r.responded_at
  from public.support_requests r where r.user_id = auth.uid()
  order by r.created_at desc limit 100
$$;

create function public.admin_support_requests(p_status text default 'open')
returns table(id uuid, user_id uuid, member_name text, category text, body text,
              status text, response text, created_at timestamptz, responded_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('open', 'answered') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  return query
    select r.id, r.user_id, p.name::text, r.category, r.body, r.status,
           r.response, r.created_at, r.responded_at
    from public.support_requests r join public.profiles p on p.id = r.user_id
    where p_status is null or r.status = p_status
    order by r.created_at desc limit 200;
end $$;

create function public.respond_support_request(p_id uuid, p_response text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_response is null or char_length(btrim(p_response)) not between 1 and 2000 then
    raise exception 'invalid response' using errcode = '22023';
  end if;
  update public.support_requests
     set status = 'answered', response = btrim(p_response),
         responded_at = now(), responded_by = auth.uid()
   where id = p_id and status = 'open';
  if not found then
    raise exception 'open request not found' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.create_support_request(text,text) from public, anon;
revoke all on function public.my_support_requests() from public, anon;
revoke all on function public.admin_support_requests(text) from public, anon;
revoke all on function public.respond_support_request(uuid,text) from public, anon;
grant execute on function public.create_support_request(text,text) to authenticated;
grant execute on function public.my_support_requests() to authenticated;
grant execute on function public.admin_support_requests(text) to authenticated;
grant execute on function public.respond_support_request(uuid,text) to authenticated;

-- Non-transactional free-text inquiries must not survive account withdrawal.
create function public.erase_support_on_withdrawal()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.account_state = 'withdrawn' and old.account_state is distinct from new.account_state then
    delete from public.support_requests where user_id = new.id;
  end if;
  return new;
end $$;

create trigger erase_support_on_withdrawal
after update of account_state on public.profiles
for each row execute function public.erase_support_on_withdrawal();
revoke all on function public.erase_support_on_withdrawal() from public, anon, authenticated;
