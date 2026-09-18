-- Current customer master. Only complete contracts may be inserted.
-- Existing session/response tables continue to preserve their contract context.
create table public.checkin_guest (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null unique check (guest_id ~ '^G[0-9]{3,}$'),
  source_spreadsheet_id text not null default '14FEUBqR5mTd0QiIyW_uYEC2lH2xwbo46D_HNBrd49To'
    check (source_spreadsheet_id = '14FEUBqR5mTd0QiIyW_uYEC2lH2xwbo46D_HNBrd49To'),
  source_sheet_id integer not null default 1004515357 check (source_sheet_id = 1004515357),
  source_row integer not null check (source_row >= 2),
  display_name text not null check (btrim(display_name) <> ''),
  phone text not null check (phone ~ '^0[0-9]{8,10}$'),
  contract_start_date date not null,
  contract_end_date date not null check (contract_end_date > contract_start_date),
  customer_status text,
  note_category text,
  note_detail text,
  source_fields jsonb not null check (jsonb_typeof(source_fields) = 'object'),
  sync_status text not null default 'ready' check (sync_status in ('ready', 'incomplete', 'missing')),
  validation_errors jsonb not null default '[]' check (jsonb_typeof(validation_errors) = 'array'),
  last_seen_at timestamptz not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.checkin_guest is '게스트_마스터에서 계약정보가 완성된 고객만 저장. ready는 데이터 완성 상태이며 발송 승인이 아님.';
comment on column public.checkin_guest.source_fields is '마지막으로 확인한 시트 원본 값. 인증된 운영 서버에서만 조회.';

create table public.checkin_guest_sync_run (
  run_id uuid primary key,
  source_read_at timestamptz not null,
  completed_at timestamptz not null default now(),
  status text not null check (status in ('success', 'failed')),
  summary jsonb not null default '{}' check (jsonb_typeof(summary) = 'object'),
  payload_hash text,
  error_code text check (length(error_code) <= 80),
  check ((status = 'success' and payload_hash is not null and error_code is null)
      or (status = 'failed' and error_code is not null))
);
create index checkin_guest_sync_latest_success on public.checkin_guest_sync_run (source_read_at desc) where status = 'success';

-- Stable customer linkage is available when the later scheduler creates a contract session.
-- Sync never creates sessions, changes old contract snapshots, or sends a message.
alter table public.checkin_participant add column guest_id uuid references public.checkin_guest(id);
create index checkin_participant_guest_id on public.checkin_participant (guest_id);

alter table public.checkin_guest enable row level security;
alter table public.checkin_guest_sync_run enable row level security;
revoke all on public.checkin_guest, public.checkin_guest_sync_run from public, anon, authenticated;
grant select, insert, update on public.checkin_guest to service_role;
grant select, insert on public.checkin_guest_sync_run to service_role;

create function public.sync_checkin_guests(
  p_guests jsonb, p_source_read_at timestamptz, p_run_id uuid, p_skipped_count integer default 0
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  r record;
  existing public.checkin_guest%rowtype;
  previous_run public.checkin_guest_sync_run%rowtype;
  payload_hash_value text;
  latest_read timestamptz;
  complete boolean;
  changed boolean;
  inserted_count integer := 0;
  updated_count integer := 0;
  unchanged_count integer := 0;
  excluded_count integer := 0;
  held_count integer := 0;
  missing_count integer := 0;
  affected integer;
  result jsonb;
begin
  if p_guests is null or jsonb_typeof(p_guests) <> 'array' then
    raise exception 'INVALID_GUEST_SNAPSHOT';
  end if;
  if jsonb_array_length(p_guests) not between 1 and 5000
     or octet_length(p_guests::text) > 5000000
     or p_run_id is null or p_source_read_at is null
     or p_source_read_at > now() + interval '5 minutes'
     or p_skipped_count is null or p_skipped_count < 0 then
    raise exception 'INVALID_GUEST_SNAPSHOT';
  end if;
  if exists (select 1 from jsonb_array_elements(p_guests) a
      where coalesce(a->>'guest_id', '') !~ '^G[0-9]{3,}$')
     or (select count(distinct a->>'guest_id') from jsonb_array_elements(p_guests) a) <> jsonb_array_length(p_guests) then
    raise exception 'INVALID_OR_DUPLICATE_GUEST_ID';
  end if;

  perform pg_advisory_xact_lock(741021005);
  payload_hash_value := encode(sha256(convert_to(jsonb_build_object(
    'guests', p_guests, 'read_at', p_source_read_at, 'skipped', p_skipped_count
  )::text, 'UTF8')), 'hex');
  select * into previous_run from public.checkin_guest_sync_run where run_id = p_run_id;
  if found then
    if previous_run.status <> 'success' or previous_run.payload_hash <> payload_hash_value then
      raise exception 'RUN_ID_REUSED';
    end if;
    return previous_run.summary;
  end if;
  select max(source_read_at) into latest_read from public.checkin_guest_sync_run where status = 'success';
  if latest_read is not null and p_source_read_at <= latest_read then
    raise exception 'STALE_GUEST_SNAPSHOT';
  end if;

  for r in select * from jsonb_to_recordset(p_guests) as x(
    guest_id text, source_row integer, display_name text, phone text,
    contract_start_date date, contract_end_date date, customer_status text,
    note_category text, note_detail text, source_fields jsonb, validation_errors jsonb
  ) loop
    if r.source_row is null or r.source_row < 2 or r.source_fields is null
       or jsonb_typeof(r.source_fields) <> 'object' or r.validation_errors is null
       or jsonb_typeof(r.validation_errors) <> 'array' then
      raise exception 'INVALID_GUEST_ROW';
    end if;
    complete := coalesce(btrim(r.display_name) <> '' and r.phone ~ '^0[0-9]{8,10}$'
      and r.contract_start_date is not null and r.contract_end_date > r.contract_start_date
      and jsonb_array_length(r.validation_errors) = 0, false);
    if not complete then
      excluded_count := excluded_count + 1;
      update public.checkin_guest set
        sync_status = 'incomplete', validation_errors = r.validation_errors,
        source_fields = r.source_fields, source_row = r.source_row,
        last_seen_at = p_source_read_at, synced_at = now(),
        updated_at = case when (sync_status, validation_errors, source_fields, source_row)
          is distinct from ('incomplete', r.validation_errors, r.source_fields, r.source_row)
          then now() else updated_at end
      where guest_id = r.guest_id;
      get diagnostics affected = row_count;
      held_count := held_count + affected;
      continue;
    end if;

    select * into existing from public.checkin_guest where guest_id = r.guest_id;
    if not found then
      insert into public.checkin_guest (
        guest_id, source_row, display_name, phone, contract_start_date, contract_end_date,
        customer_status, note_category, note_detail, source_fields, last_seen_at
      ) values (
        r.guest_id, r.source_row, r.display_name, r.phone, r.contract_start_date, r.contract_end_date,
        r.customer_status, r.note_category, r.note_detail, r.source_fields, p_source_read_at
      );
      inserted_count := inserted_count + 1;
    else
      changed := (existing.source_row, existing.display_name, existing.phone,
        existing.contract_start_date, existing.contract_end_date, existing.customer_status,
        existing.note_category, existing.note_detail, existing.source_fields, existing.sync_status)
        is distinct from (r.source_row, r.display_name, r.phone,
        r.contract_start_date, r.contract_end_date, r.customer_status,
        r.note_category, r.note_detail, r.source_fields, 'ready');
      update public.checkin_guest set
        source_row = r.source_row, display_name = r.display_name, phone = r.phone,
        contract_start_date = r.contract_start_date, contract_end_date = r.contract_end_date,
        customer_status = r.customer_status, note_category = r.note_category, note_detail = r.note_detail,
        source_fields = r.source_fields, sync_status = 'ready', validation_errors = '[]',
        last_seen_at = p_source_read_at, synced_at = now(),
        updated_at = case when changed then now() else updated_at end
      where id = existing.id;
      if changed then updated_count := updated_count + 1;
      else unchanged_count := unchanged_count + 1; end if;
    end if;
  end loop;

  -- Removed rows and ID-only placeholders are held, never deleted.
  update public.checkin_guest g set sync_status = 'missing', updated_at = now(), synced_at = now()
  where g.sync_status <> 'missing'
    and not exists (select 1 from jsonb_array_elements(p_guests) a where a->>'guest_id' = g.guest_id);
  select count(*) into missing_count from public.checkin_guest where sync_status = 'missing';
  result := jsonb_build_object('seen', jsonb_array_length(p_guests),
    'inserted', inserted_count, 'updated', updated_count, 'unchanged', unchanged_count,
    'excluded_incomplete', excluded_count, 'held_existing', held_count,
    'missing_existing', missing_count, 'skipped_placeholders', p_skipped_count);
  insert into public.checkin_guest_sync_run (run_id, source_read_at, status, summary, payload_hash)
  values (p_run_id, p_source_read_at, 'success', result, payload_hash_value);
  return result;
end;
$$;
revoke all on function public.sync_checkin_guests(jsonb, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.sync_checkin_guests(jsonb, timestamptz, uuid, integer) to service_role;
