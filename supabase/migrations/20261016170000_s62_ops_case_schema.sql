-- The domain tables remain authoritative. Cases are a bounded projection of
-- current work, not a second copy of report bodies or payment credentials.
create table public.ops_cases (
  id uuid primary key default gen_random_uuid(),
  case_type text not null check (case_type in (
    'support', 'photo_review', 'content_report', 'no_show_report', 'payment_unknown'
  )),
  source_id text not null check (char_length(source_id) between 1 and 80),
  subject_id uuid references public.profiles(id) on delete set null,
  occurrence integer not null check (occurrence > 0),
  priority text not null check (priority in ('critical', 'high', 'normal')),
  status text not null default 'open' check (status in (
    'open', 'in_progress', 'waiting', 'snoozed', 'resolved', 'superseded'
  )),
  opened_at timestamptz not null default now(),
  due_at timestamptz not null,
  next_check_at timestamptz,
  source_revision text not null,
  resolved_at timestamptz,
  resolution_code text,
  version integer not null default 1 check (version > 0),
  constraint ops_case_resolution_consistency check (
    (status in ('resolved', 'superseded') and resolved_at is not null) or
    (status not in ('resolved', 'superseded') and resolved_at is null)
  ),
  unique (case_type, source_id, occurrence)
);
create unique index ops_cases_one_active_source
  on public.ops_cases(case_type, source_id)
  where status not in ('resolved', 'superseded');
create index ops_cases_worklist on public.ops_cases(status, priority, due_at, id);
create index ops_cases_subject_history on public.ops_cases(subject_id, opened_at desc, id);

create table public.ops_case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.ops_cases(id),
  event_type text not null check (event_type in (
    'opened', 'source_changed', 'started', 'waiting', 'snoozed',
    'reopened', 'resolved', 'superseded'
  )),
  actor_type text not null check (actor_type in ('system', 'admin')),
  actor_id uuid references public.profiles(id) on delete set null,
  from_status text,
  to_status text not null,
  reason_code text,
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  request_id uuid unique,
  created_at timestamptz not null default now()
);
create index ops_case_events_case_time on public.ops_case_events(case_id, created_at, id);

create table public.domain_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in (
    'support_requested', 'support_answered', 'photo_submitted', 'photo_reviewed',
    'content_reported', 'content_report_resolved', 'no_show_reported',
    'no_show_resolved', 'payment_attention', 'payment_reconciled',
    'meeting_confirmed', 'meeting_canceled', 'ticket_issued',
    'ticket_consumed', 'ticket_restored', 'intro_delivered',
    'intro_opened', 'intro_expired'
  )),
  aggregate_type text not null,
  aggregate_id text not null,
  subject_id uuid references public.profiles(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  source_version text,
  dedupe_key text not null unique,
  props jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object')
);
create index domain_events_type_time on public.domain_events(event_type, occurred_at, id);
create index domain_events_aggregate_time
  on public.domain_events(aggregate_type, aggregate_id, occurred_at, id);
create index domain_events_subject_time on public.domain_events(subject_id, occurred_at desc, id);

alter table public.ops_cases enable row level security;
alter table public.ops_case_events enable row level security;
alter table public.domain_events enable row level security;
revoke all on public.ops_cases, public.ops_case_events, public.domain_events
  from public, anon, authenticated;
grant select, insert, update on public.ops_cases to service_role;
grant select, insert on public.ops_case_events to service_role;
grant usage, select on sequence public.ops_case_events_id_seq to service_role;
grant select, insert on public.domain_events to service_role;
grant usage, select on sequence public.domain_events_id_seq to service_role;

alter table public.admin_actions
  add column case_id uuid references public.ops_cases(id),
  add column request_id uuid;
create index admin_actions_case_time on public.admin_actions(case_id, created_at desc);
alter table public.admin_actions drop constraint admin_actions_kind_check;
alter table public.admin_actions add constraint admin_actions_kind_check check (kind = any (array[
  'resolve_report', 'ban', 'unban', 'refund', 'cancel_meeting', 'review_photo', 'set_queue',
  'resolve_no_show', 'set_payments', 'fulfill_order', 'reset_photo', 'retry_notification',
  'set_queue_reason', 'upsert_place', 'reconcile_payment', 'case_transition'
]));
