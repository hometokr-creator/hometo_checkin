-- Date-only planning. No sessions, tokens, deliveries or provider requests are created.
create table public.checkin_contract (
  id uuid primary key default gen_random_uuid(),
  logical_contract_id uuid not null default gen_random_uuid(),
  guest_id uuid not null references public.checkin_guest(id),
  participant_id uuid not null unique references public.checkin_participant(id),
  previous_id uuid references public.checkin_contract(id),
  change_kind text not null check (change_kind in ('initial','correction','renewal')),
  is_renewal boolean not null default false,
  contract_start_date date not null,
  contract_end_date date not null check (contract_end_date > contract_start_date),
  planning_from date not null,
  state text not null default 'active' check (state in ('active','review_required','superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, logical_contract_id)
);
create unique index checkin_contract_current_guest on public.checkin_contract(guest_id) where state <> 'superseded';
create index checkin_contract_guest_history on public.checkin_contract(guest_id, created_at);
create index checkin_contract_previous on public.checkin_contract(previous_id);

create table public.checkin_schedule (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null,
  logical_contract_id uuid not null,
  round_key text not null check (round_key = 'day:7' or round_key ~ '^month:[1-9][0-9]*$'),
  round_type text not null check (round_type in ('onboarding-d7','monthly-first','monthly','monthly-renewal')),
  scheduled_on date not null,
  state text not null default 'planned' check (state in ('planned','held','cancelled','session_created')),
  hold_reason text check (hold_reason in ('CONTRACT_CHANGED','GUEST_NOT_READY','GUEST_STATUS_EXCLUDED','CONTRACT_ENDED','PAST_DUE_REVIEW','CONTRACT_REPLACED')),
  session_id uuid unique references public.checkin_session(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (contract_id, logical_contract_id) references public.checkin_contract(id, logical_contract_id),
  unique (logical_contract_id, round_key),
  check ((state = 'session_created') = (session_id is not null)),
  check ((state in ('held','cancelled')) = (hold_reason is not null))
);
create index checkin_schedule_due on public.checkin_schedule(scheduled_on) where state = 'planned';
create index checkin_schedule_contract on public.checkin_schedule(contract_id);

alter table public.checkin_contract enable row level security;
alter table public.checkin_schedule enable row level security;
revoke all on public.checkin_contract, public.checkin_schedule from public, anon, authenticated;
grant select, insert, update on public.checkin_contract, public.checkin_schedule to service_role;

-- Anchor every month to the original start date: Jan 31 -> Feb 28 -> Mar 31.
create function public.checkin_contract_rounds(p_start date, p_end date, p_not_before date, p_renewal boolean default false)
returns table(round_key text, round_type text, scheduled_on date)
language plpgsql immutable security invoker set search_path = '' as $$
begin
  if p_start is null or p_end is null or p_not_before is null or p_renewal is null
     or not isfinite(p_start) or not isfinite(p_end) or not isfinite(p_not_before) or p_end <= p_start then
    raise exception 'INVALID_CONTRACT_RANGE';
  end if;
  return query
    with months as (
      select n, (p_start + make_interval(months => n))::date as day
      from generate_series(1, ((extract(year from p_end) - extract(year from p_start)) * 12
        + extract(month from p_end) - extract(month from p_start))::int) n
      where (p_start + make_interval(months => n))::date < p_end
    ), rounds as (
      select 'day:7'::text as key, 'onboarding-d7'::text as kind, p_start + 7 as day
      where not p_renewal and p_start + 7 < p_end
      union all
      select 'month:' || n, case when n = max(n) over () then 'monthly-renewal'
        when n = 1 and not p_renewal then 'monthly-first' else 'monthly' end, day from months
    ) select key, kind, day from rounds where day >= p_not_before order by day;
end;
$$;
revoke all on function public.checkin_contract_rounds(date,date,date,boolean) from public, anon, authenticated;
grant execute on function public.checkin_contract_rounds(date,date,date,boolean) to service_role;

-- Internal planning RPC. The same advisory lock as sheet sync prevents interleaved snapshots.
create function public.reconcile_guest_checkin_schedule(p_guest_id uuid, p_as_of date default (now() at time zone 'Asia/Seoul')::date)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  g public.checkin_guest%rowtype;
  c public.checkin_contract%rowtype;
  pid uuid;
  reason text;
  item record;
begin
  if p_as_of is null or not isfinite(p_as_of) then raise exception 'INVALID_PLANNING_DATE'; end if;
  perform pg_advisory_xact_lock(741021005);
  select * into g from public.checkin_guest where id = p_guest_id for update;
  if not found then raise exception 'GUEST_NOT_FOUND'; end if;
  select * into c from public.checkin_contract where guest_id = g.id and state <> 'superseded' for update;
  if c.id is not null and (c.contract_start_date, c.contract_end_date) is distinct from (g.contract_start_date, g.contract_end_date) then
    update public.checkin_contract set state = 'review_required', updated_at = now() where id = c.id;
    c.state := 'review_required';
  end if;
  reason := case
    when c.state = 'review_required' then 'CONTRACT_CHANGED'
    when g.sync_status <> 'ready' then 'GUEST_NOT_READY'
    when coalesce(btrim(g.customer_status), '') not in ('계약중','입주중') then 'GUEST_STATUS_EXCLUDED'
    when g.contract_end_date <= p_as_of then 'CONTRACT_ENDED'
    else null end;
  if reason is not null then
    if c.id is not null then
      update public.checkin_participant set active = false where id = c.participant_id;
      update public.checkin_schedule set state = 'held', hold_reason = reason, updated_at = now()
        where contract_id = c.id and session_id is null and state <> 'cancelled'
          and (state, hold_reason) is distinct from ('held', reason);
    end if;
    return jsonb_build_object('state','held','reason',reason);
  end if;
  if c.id is null then
    insert into public.checkin_participant(guest_id, display_name, phone, contract_start_date, contract_end_date)
      values(g.id, g.display_name, g.phone, g.contract_start_date, g.contract_end_date) returning id into pid;
    insert into public.checkin_contract(guest_id, participant_id, change_kind, contract_start_date, contract_end_date, planning_from)
      values(g.id, pid, 'initial', g.contract_start_date, g.contract_end_date, p_as_of) returning * into c;
  end if;
  update public.checkin_participant set active = true where id = c.participant_id and not active;
  -- Past held/planned rounds need an explicit late-delivery policy; never silently catch up.
  update public.checkin_schedule set state = 'held', hold_reason = 'PAST_DUE_REVIEW', updated_at = now()
    where contract_id = c.id and session_id is null and state in ('planned','held') and scheduled_on < p_as_of
      and (state, hold_reason) is distinct from ('held','PAST_DUE_REVIEW');
  for item in select * from public.checkin_contract_rounds(c.contract_start_date, c.contract_end_date,
      greatest(c.planning_from, p_as_of), c.is_renewal) loop
    insert into public.checkin_schedule(contract_id, logical_contract_id, round_key, round_type, scheduled_on)
      values(c.id, c.logical_contract_id, item.round_key, item.round_type, item.scheduled_on)
    on conflict (logical_contract_id, round_key) do update set
      contract_id = excluded.contract_id, round_type = excluded.round_type, scheduled_on = excluded.scheduled_on,
      state = 'planned', hold_reason = null, updated_at = now()
    where checkin_schedule.session_id is null and
      (checkin_schedule.contract_id, checkin_schedule.round_type, checkin_schedule.scheduled_on, checkin_schedule.state)
      is distinct from (excluded.contract_id, excluded.round_type, excluded.scheduled_on, 'planned');
  end loop;
  return jsonb_build_object('state','planned','contractId',c.id,
    'planned',(select count(*) from public.checkin_schedule where contract_id = c.id and state = 'planned'));
end;
$$;
revoke all on function public.reconcile_guest_checkin_schedule(uuid,date) from public, anon, authenticated;
grant execute on function public.reconcile_guest_checkin_schedule(uuid,date) to service_role;

-- Manual decision with optimistic locking: do not resolve a newer sheet change by mistake.
create function public.resolve_checkin_contract_change(p_guest_id uuid, p_expected_contract_id uuid,
  p_expected_start date, p_expected_end date, p_kind text,
  p_as_of date default (now() at time zone 'Asia/Seoul')::date)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  g public.checkin_guest%rowtype;
  old public.checkin_contract%rowtype;
  pid uuid;
  logical_id uuid;
begin
  if p_kind is null or p_kind not in ('correction','renewal') or p_as_of is null or not isfinite(p_as_of) then
    raise exception 'INVALID_CONTRACT_RESOLUTION';
  end if;
  perform pg_advisory_xact_lock(741021005);
  select * into g from public.checkin_guest where id = p_guest_id for update;
  select * into old from public.checkin_contract where guest_id = p_guest_id and state <> 'superseded' for update;
  if g.id is null or old.id is null or old.id is distinct from p_expected_contract_id or old.state <> 'review_required'
    or (g.contract_start_date, g.contract_end_date) is distinct from (p_expected_start, p_expected_end)
    or g.sync_status <> 'ready' then raise exception 'CONTRACT_REVIEW_CONFLICT'; end if;
  logical_id := case when p_kind = 'correction' then old.logical_contract_id else gen_random_uuid() end;
  update public.checkin_contract set state = 'superseded', updated_at = now() where id = old.id;
  update public.checkin_participant set active = false where id = old.participant_id;
  update public.checkin_schedule set state = 'cancelled', hold_reason = 'CONTRACT_REPLACED', updated_at = now()
    where contract_id = old.id and session_id is null;
  insert into public.checkin_participant(guest_id, display_name, phone, contract_start_date, contract_end_date, active)
    values(g.id, g.display_name, g.phone, g.contract_start_date, g.contract_end_date, false) returning id into pid;
  insert into public.checkin_contract(guest_id, participant_id, previous_id, logical_contract_id, change_kind,
    is_renewal, contract_start_date, contract_end_date, planning_from)
    values(g.id, pid, old.id, logical_id, p_kind, case when p_kind = 'renewal' then true else old.is_renewal end,
      g.contract_start_date, g.contract_end_date, greatest(old.planning_from, p_as_of));
  return public.reconcile_guest_checkin_schedule(g.id, p_as_of);
end;
$$;
revoke all on function public.resolve_checkin_contract_change(uuid,uuid,date,date,text,date) from public, anon, authenticated;
grant execute on function public.resolve_checkin_contract_change(uuid,uuid,date,date,text,date) to service_role;

-- Used by the operator CLI, including a no-write preview within a rolled-back subtransaction.
create function public.plan_checkin_schedules(p_dry_run boolean default true)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  guest record;
  outcome jsonb;
  total int := 0;
  planned int := 0;
  held int := 0;
  result jsonb;
begin
  if p_dry_run is null then raise exception 'INVALID_PLANNING_MODE'; end if;
  perform pg_advisory_xact_lock(741021005);
  begin
    for guest in select id from public.checkin_guest order by id loop
      outcome := public.reconcile_guest_checkin_schedule(guest.id);
      total := total + 1;
      if outcome->>'state' = 'planned' then planned := planned + (outcome->>'planned')::int;
      else held := held + 1; end if;
    end loop;
    result := jsonb_build_object('guests',total,'planned',planned,'heldGuests',held,'dryRun',p_dry_run,
      'contracts', (select coalesce(jsonb_agg(jsonb_build_object(
        'guestUuid',g.id,'guestId',g.guest_id,'contractId',c.id,'state',c.state,
        'savedStart',c.contract_start_date,'savedEnd',c.contract_end_date,
        'currentStart',g.contract_start_date,'currentEnd',g.contract_end_date) order by g.guest_id),'[]'::jsonb)
        from public.checkin_contract c join public.checkin_guest g on g.id = c.guest_id where c.state <> 'superseded'),
      'schedules', (select coalesce(jsonb_agg(jsonb_build_object(
        'guestId',g.guest_id,'contractId',c.id,'roundKey',s.round_key,'roundType',s.round_type,
        'date',s.scheduled_on,'state',s.state,'reason',s.hold_reason) order by g.guest_id,s.scheduled_on),'[]'::jsonb)
        from public.checkin_schedule s join public.checkin_contract c on c.id = s.contract_id
          join public.checkin_guest g on g.id = c.guest_id where c.state <> 'superseded'));

    if p_dry_run then raise exception using errcode = 'PGR01', message = 'ROLLBACK_PREVIEW'; end if;
  exception when sqlstate 'PGR01' then
    if not p_dry_run then raise; end if;
  end;
  return result;
end;
$$;
revoke all on function public.plan_checkin_schedules(boolean) from public, anon, authenticated;
grant execute on function public.plan_checkin_schedules(boolean) to service_role;

-- Any sheet upsert immediately reconciles eligibility. Missing/incomplete rows also hold schedules.
create function public.checkin_guest_schedule_changed()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform public.reconcile_guest_checkin_schedule(new.id);
  return new;
end;
$$;
revoke all on function public.checkin_guest_schedule_changed() from public, anon, authenticated;
create trigger checkin_guest_schedule_changed after insert or update on public.checkin_guest
for each row execute function public.checkin_guest_schedule_changed();

comment on table public.checkin_contract is '계약 날짜 스냅샷. 정정은 logical_contract_id 유지, 재계약은 새 ID. 과거 응답의 계약 날짜는 변경하지 않음.';
comment on table public.checkin_schedule is '예정 날짜만 저장. 발송 시각/휴일/지연 처리와 NHN 발송 연결은 별도. 이 테이블 생성은 발송 승인이 아님.';
