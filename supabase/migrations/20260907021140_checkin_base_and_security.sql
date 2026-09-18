-- 18.4 수동 입력 대상. 본 서비스 마스터를 복제하지 않고 체크인 운영에 필요한 최소만.
create table checkin_participant (
  id                    uuid primary key default gen_random_uuid(),
  display_name          text not null,
  phone                 text not null,
  contract_start_date   date not null,
  contract_end_date     date not null,
  property_label        text,
  host_name             text,
  external_contract_ref text,
  memo                  text,
  active                boolean not null default true,
  created_at            timestamptz not null default now()
);

create table checkin_session (
  id                  uuid primary key default gen_random_uuid(),
  participant_id      uuid not null references checkin_participant(id),
  persona_type        text not null default 'guest',
  round_type          text not null,   -- onboarding-d7 | monthly-first | monthly | monthly-renewal | event
  round_key           text not null,   -- 재발송에도 불변인 업무상 회차 식별자
  scenario_id         text not null,
  scenario_version    int  not null default 1,
  triage_rule_version int  not null default 1,
  event_type          text,            -- facility | rule (이벤트 회차만)
  source_event_ref    text,
  event_context_snapshot jsonb,
  status              text not null default 'open',  -- open | completed | cancelled
  created_at          timestamptz not null default now(),
  answer_expires_at   timestamptz not null,          -- 발송 + 14일 (정책 1)
  completed_at        timestamptz,
  unique (participant_id, round_key)                  -- §10.2 제약
);

create table checkin_access_token (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references checkin_session(id),
  token_digest text not null unique,     -- 원문 대신 다이제스트 보관
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz
);
create index on checkin_access_token (session_id);

create table checkin_response (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null unique references checkin_session(id),  -- 세션당 1건
  schema_version  int  not null,
  scenario_id     text not null,
  scenario_version int not null,
  triage_rule_version int not null,
  idempotency_key text not null,
  request_hash    text not null,
  answers_json    jsonb not null,        -- 최종 응답 원본
  outcome         text not null,         -- ok | reported | urgent (서버 재계산)
  overall_triage  text,                  -- R1 | R2 | NULL
  submitted_at    timestamptz not null default now()
);

create table checkin_issue (
  id              uuid primary key default gen_random_uuid(),
  response_id     uuid not null references checkin_response(id),
  ordinal         int  not null,         -- 1~2
  tag             text not null,
  detail          text,
  free_text       text,
  reported_triage text not null,         -- R1 | R2 (최초 결정론 판정)
  case_ref        text,
  created_at      timestamptz not null default now(),
  unique (response_id, ordinal)
);
create index on checkin_issue (tag);
create index on checkin_issue (reported_triage, created_at);

create table checkin_interest (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references checkin_session(id),
  experiment_key      text not null default 'community-interest:v1',
  variant_key         text,
  clicked             boolean not null default false,
  topics              text[] not null default '{}',
  hook_percent_snapshot int,
  created_at          timestamptz not null default now(),
  exposed_at          timestamptz,
  clicked_at          timestamptz,
  topics_submitted_at timestamptz,
  unique (session_id, experiment_key)
);

-- 18.5 진행 이벤트
create table checkin_progress_event (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references checkin_session(id),
  scenario_id text not null,
  step_id     text not null,
  reached_at  timestamptz not null default now(),
  unique (session_id, step_id)
);

-- 발송 이력 (리마인더 포함 · 정책 3)
create table checkin_delivery (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references checkin_session(id),
  kind               text not null,   -- initial | reminder
  channel            text not null default 'alimtalk',
  provider_message_id text,
  status             text not null,   -- requested | sent | failed
  requested_at       timestamptz not null default now(),
  sent_at            timestamptz,
  failed_at          timestamptz
);
create index on checkin_delivery (session_id);

-- 상담원 운영 큐 (미처리 R1 우선)
create view open_issues as
select i.*, r.session_id, r.outcome, s.round_type, p.display_name, p.phone, p.property_label
from checkin_issue i
join checkin_response r on r.id = i.response_id
join checkin_session  s on s.id = r.session_id
join checkin_participant p on p.id = s.participant_id
where i.case_ref is null
order by (i.reported_triage = 'R1') desc, i.created_at asc;

-- Server-only access. No public client policies are intentional.
alter table public.checkin_participant enable row level security;
revoke all on public.checkin_participant from public, anon, authenticated;
grant select, insert, update, delete on public.checkin_participant to service_role;
alter table public.checkin_session enable row level security;
revoke all on public.checkin_session from public, anon, authenticated;
grant select, insert, update, delete on public.checkin_session to service_role;
alter table public.checkin_access_token enable row level security;
revoke all on public.checkin_access_token from public, anon, authenticated;
grant select, insert, update, delete on public.checkin_access_token to service_role;
alter table public.checkin_response enable row level security;
revoke all on public.checkin_response from public, anon, authenticated;
grant select, insert, update, delete on public.checkin_response to service_role;
alter table public.checkin_issue enable row level security;
revoke all on public.checkin_issue from public, anon, authenticated;
grant select, insert, update, delete on public.checkin_issue to service_role;
alter table public.checkin_interest enable row level security;
revoke all on public.checkin_interest from public, anon, authenticated;
grant select, insert, update, delete on public.checkin_interest to service_role;
alter table public.checkin_progress_event enable row level security;
revoke all on public.checkin_progress_event from public, anon, authenticated;
grant select, insert, update, delete on public.checkin_progress_event to service_role;
alter table public.checkin_delivery enable row level security;
revoke all on public.checkin_delivery from public, anon, authenticated;
grant select, insert, update, delete on public.checkin_delivery to service_role;
alter view public.open_issues set (security_invoker = true);
revoke all on public.open_issues from public, anon, authenticated;
grant select on public.open_issues to service_role;
alter table public.checkin_participant add constraint participant_dates check(contract_end_date >= contract_start_date), add constraint participant_name check(length(trim(display_name)) > 0), add constraint participant_phone check(length(trim(phone)) > 0);
alter table public.checkin_session add constraint session_persona check(persona_type='guest'), add constraint session_round check(round_type in ('onboarding-d7','monthly-first','monthly','monthly-renewal','event')), add constraint session_status check(status in ('open','completed','cancelled')), add constraint session_versions check(scenario_version>0 and triage_rule_version>0), add constraint session_completion check((status='completed') = (completed_at is not null)), add constraint session_event check((round_type='event' and event_type in ('facility','rule') and event_context_snapshot is not null) or (round_type<>'event' and event_type is null and event_context_snapshot is null));
alter table public.checkin_access_token add constraint token_digest_format check(token_digest ~ '^[0-9a-f]{64}$');
alter table public.checkin_response add constraint response_schema check(schema_version=1), add constraint response_outcome check(outcome in ('ok','reported','urgent')), add constraint response_triage check(overall_triage in ('R1','R2')), add constraint response_hash check(request_hash ~ '^[0-9a-f]{64}$'), add constraint response_answers check(jsonb_typeof(answers_json)='object' and jsonb_typeof(answers_json->'issues')='array' and jsonb_array_length(answers_json->'issues')<=2);
alter table public.checkin_issue add constraint issue_ordinal check(ordinal between 1 and 2), add constraint issue_tag check(tag in ('facility','relationship','settlement','urgent','other')), add constraint issue_triage check(reported_triage=case when tag='urgent' then 'R1' else 'R2' end), add constraint issue_length check(char_length(free_text)<=500), add constraint issue_distinct_tag unique(response_id,tag);
alter table public.checkin_interest add constraint interest_percent check(hook_percent_snapshot between 0 and 100), add constraint interest_topics check(topics <@ array['kitchen','daily-life','cleaning','host','costs','other']::text[] and cardinality(topics)<=6), add constraint interest_click check(clicked=(clicked_at is not null)), add constraint interest_order check((clicked_at is null or exposed_at is not null) and (topics_submitted_at is null or clicked_at is not null));
alter table public.checkin_delivery add constraint delivery_kind check(kind in ('initial','reminder')), add constraint delivery_status check(status in ('requested','sent','failed'));
create index checkin_session_participant_idx on public.checkin_session(participant_id);
