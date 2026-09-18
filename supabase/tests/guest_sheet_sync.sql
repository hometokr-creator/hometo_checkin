-- Synthetic-only checks. All writes are rolled back, including run records.
begin;
set local role service_role;
do $$
declare
  moment timestamptz := clock_timestamp();
  test_run_id uuid := gen_random_uuid();
  original_id uuid;
  original_end date;
  original_count integer;
  good jsonb := jsonb_build_object(
    'guest_id', 'G990001', 'source_row', 2, 'display_name', '동기화 가상 고객',
    'phone', '01000000000', 'contract_start_date', '2026-08-30', 'contract_end_date', '2027-02-28',
    'customer_status', '계약중', 'gender', '여성', 'school', '가상대학교',
    'validation_errors', '[]'::jsonb);
  incomplete jsonb := jsonb_build_object(
    'guest_id', 'G990002', 'source_row', 3, 'display_name', '미완성 가상 고객',
    'phone', '01000000000', 'contract_start_date', null, 'contract_end_date', null,
    'source_fields', jsonb_build_object('fixture', true),
    'validation_errors', '[{"field":"contractStart","code":"missing"}]'::jsonb);
  payload jsonb;
  result jsonb;
  rejected boolean;
begin
  if exists(select 1 from public.checkin_guest where guest_id in ('G990001', 'G990002')) then
    raise exception 'FIXTURE_ID_COLLISION';
  end if;
  select count(*) into original_count from public.checkin_guest;
  payload := jsonb_build_array(good, incomplete);
  result := public.sync_checkin_guests(payload, moment, test_run_id, 2);
  assert (result->>'inserted')::int = 1 and (result->>'excluded_incomplete')::int = 1;
  assert (select count(*) = original_count + 1 from public.checkin_guest);
  assert not exists(select 1 from public.checkin_guest where guest_id = 'G990002');
  select id, contract_end_date into original_id, original_end from public.checkin_guest where guest_id = 'G990001';

  assert public.sync_checkin_guests(payload, moment, test_run_id, 2) = result;
  assert (select count(*) = 1 from public.checkin_guest_sync_run where run_id = test_run_id);
  result := public.sync_checkin_guests(payload, moment + interval '1 second', gen_random_uuid(), 2);
  assert (result->>'inserted')::int = 0 and (result->>'unchanged')::int = 1;

  good := jsonb_set(good, '{school}', '"다른 가상대학교"');
  result := public.sync_checkin_guests(jsonb_build_array(good, incomplete), moment + interval '2 seconds', gen_random_uuid(), 2);
  assert (result->>'updated')::int = 1;
  assert (select id = original_id and school = '다른 가상대학교' from public.checkin_guest where guest_id = 'G990001');

  assert not exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'checkin_guest' and column_name in ('source_fields', 'note_category', 'note_detail'));

  -- Clearing a required field holds an existing customer without destroying valid historical fields.
  good := jsonb_set(jsonb_set(good, '{contract_end_date}', 'null'), '{validation_errors}', '[{"field":"contractEnd","code":"missing"}]');
  result := public.sync_checkin_guests(jsonb_build_array(good, incomplete), moment + interval '3 seconds', gen_random_uuid(), 2);
  assert (result->>'held_existing')::int = 1;
  assert (select id = original_id and contract_end_date = original_end and sync_status = 'incomplete' from public.checkin_guest where guest_id = 'G990001');

  -- Completing a previously excluded row inserts it on the next run.
  incomplete := jsonb_set(jsonb_set(jsonb_set(incomplete, '{contract_start_date}', '"2026-09-01"'), '{contract_end_date}', '"2027-01-01"'), '{validation_errors}', '[]');
  result := public.sync_checkin_guests(jsonb_build_array(incomplete), moment + interval '4 seconds', gen_random_uuid(), 2);
  assert (result->>'inserted')::int = 1;
  assert (select sync_status = 'missing' from public.checkin_guest where guest_id = 'G990001');
  assert (select count(*) = original_count + 2 from public.checkin_guest);

  -- Restoring the row reuses the same customer UUID.
  good := jsonb_set(jsonb_set(good, '{contract_end_date}', '"2027-02-28"'), '{validation_errors}', '[]');
  perform public.sync_checkin_guests(jsonb_build_array(good, incomplete), moment + interval '5 seconds', gen_random_uuid(), 2);
  assert (select id = original_id and sync_status = 'ready' from public.checkin_guest where guest_id = 'G990001');

  rejected := false;
  begin perform public.sync_checkin_guests(payload, moment, gen_random_uuid(), 2);
  exception when others then rejected := SQLERRM = 'STALE_GUEST_SNAPSHOT'; end;
  assert rejected;
  rejected := false;
  begin perform public.sync_checkin_guests(jsonb_build_array(good, good), moment + interval '6 seconds', gen_random_uuid(), 0);
  exception when others then rejected := SQLERRM = 'INVALID_OR_DUPLICATE_GUEST_ID'; end;
  assert rejected;
  rejected := false;
  begin perform public.sync_checkin_guests('[]', moment + interval '6 seconds', gen_random_uuid(), 0);
  exception when others then rejected := SQLERRM = 'INVALID_GUEST_SNAPSHOT'; end;
  assert rejected;

  -- Old deployed server: extract only the two newly selected fields from its raw blob.
  good := (good - 'gender' - 'school') || jsonb_build_object(
    'note_detail', 'must not persist',
    'source_fields', jsonb_build_object('성별', '여성', '학교또는직장명', '레거시 가상대학교', '나이', 'must not persist'));
  perform public.sync_checkin_guests(jsonb_build_array(good, incomplete), moment + interval '7 seconds', gen_random_uuid(), 0);
  assert (select gender = '여성' and school = '레거시 가상대학교' from public.checkin_guest where guest_id = 'G990001');
  -- Explicitly clearing optional fields is retained, with no raw source fields required.
  good := (good - 'source_fields') || jsonb_build_object('gender', null, 'school', null);
  perform public.sync_checkin_guests(jsonb_build_array(good, incomplete), moment + interval '8 seconds', gen_random_uuid(), 0);
  assert (select gender is null and school is null from public.checkin_guest where guest_id = 'G990001');

  assert not has_table_privilege('anon', 'public.checkin_guest', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.checkin_guest', 'SELECT');
  assert not has_function_privilege('anon', 'public.sync_checkin_guests(jsonb,timestamptz,uuid,integer)', 'EXECUTE');
  assert (select relrowsecurity from pg_class where oid = 'public.checkin_guest'::regclass);
end;
$$;
rollback;
select 'guest_sheet_sync passed (rolled back)' as result;
