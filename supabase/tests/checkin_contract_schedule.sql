-- Synthetic fixtures only; use the test project. Every change rolls back.
begin;
set local role service_role;
do $$
declare
  gid uuid := gen_random_uuid();
  cid uuid;
  logical_id uuid;
  pid uuid;
  previous_pid uuid;
  sid uuid;
  changed_cid uuid;
  snapshot_count int;
  original_sessions int;
  result jsonb;
  expected jsonb;
  rejected boolean;
  moment date := (now() at time zone 'Asia/Seoul')::date;
begin
  select jsonb_agg(jsonb_build_array(round_key,round_type,scheduled_on) order by scheduled_on) into result
    from public.checkin_contract_rounds('2026-01-31','2026-05-31','2026-01-31');
  assert result = '[ ["day:7","onboarding-d7","2026-02-07"], ["month:1","monthly-first","2026-02-28"], ["month:2","monthly","2026-03-31"], ["month:3","monthly-renewal","2026-04-30"]]'::jsonb;
  assert (select scheduled_on = '2028-02-29' from public.checkin_contract_rounds('2028-01-30','2028-04-01','2028-01-30') where round_key = 'month:1');
  assert (select scheduled_on = '2027-01-18' from public.checkin_contract_rounds('2026-02-18','2027-02-18','2026-02-18') where round_type = 'monthly-renewal');
  assert not exists(select 1 from public.checkin_contract_rounds('2026-09-01','2026-09-08','2026-09-01'));
  assert (select count(*) = 1 from public.checkin_contract_rounds('2026-09-01','2026-09-09','2026-09-01'));
  assert (select round_type = 'monthly-renewal' from public.checkin_contract_rounds('2026-09-01','2026-11-01','2026-09-01') where round_key = 'month:1');
  assert not exists(select 1 from public.checkin_contract_rounds('2026-02-18','2027-02-18','2026-09-18') where scheduled_on < '2026-09-18');
  assert not exists(select 1 from public.checkin_contract_rounds('2026-02-18','2027-02-18','2026-02-18',true) where round_type in ('monthly-first','onboarding-d7'));

  select count(*) into original_sessions from public.checkin_session;
  insert into public.checkin_guest(id,guest_id,source_row,display_name,phone,contract_start_date,contract_end_date,customer_status,last_seen_at)
    values(gid,'G998801',2,'일정 가상 고객','01000000000',moment,moment + interval '6 months','매칭중',now());
  assert not exists(select 1 from public.checkin_contract where guest_id = gid);
  -- Eligibility is explicit, not merely a complete contract.
  update public.checkin_guest set customer_status = '계약중' where id = gid;
  select id,logical_contract_id,participant_id into cid,logical_id,pid from public.checkin_contract where guest_id = gid and state = 'active';
  assert cid is not null and (select guest_id = gid from public.checkin_participant where id = pid);
  assert exists(select 1 from public.checkin_schedule where contract_id = cid and state = 'planned');
  assert not exists(select 1 from public.checkin_schedule where contract_id = cid and scheduled_on < moment);
  assert (select count(*) = original_sessions from public.checkin_session); -- No premature tokens/expiry.
  select count(*) into snapshot_count from public.checkin_schedule where contract_id = cid;
  perform public.reconcile_guest_checkin_schedule(gid);
  assert (select count(*) = snapshot_count from public.checkin_schedule where contract_id = cid);
  assert (select count(*) = 1 from public.checkin_contract where guest_id = gid);

  update public.checkin_guest set customer_status = '퇴실' where id = gid;
  assert not exists(select 1 from public.checkin_schedule where contract_id = cid and state = 'planned');
  assert (select not active from public.checkin_participant where id = pid);
  update public.checkin_guest set customer_status = '입주중' where id = gid;
  assert (select count(*) = snapshot_count from public.checkin_schedule where contract_id = cid and state = 'planned');
  update public.checkin_guest set sync_status = 'incomplete' where id = gid;
  assert not exists(select 1 from public.checkin_schedule where contract_id = cid and state = 'planned');
  update public.checkin_guest set sync_status = 'ready' where id = gid;

  -- Simulate one consumed opportunity. Future delivery must use the same logical round key.
  sid := public.create_checkin_session(pid,'onboarding-d7','contract:' || logical_id || ':day:7','onboarding-d7-guest',null,null,now(),repeat('a',64));
  update public.checkin_schedule set session_id = sid, state = 'session_created', hold_reason = null
    where contract_id = cid and round_key = 'day:7';
  update public.checkin_guest set contract_end_date = (moment + interval '7 months')::date where id = gid;
  assert (select state = 'review_required' from public.checkin_contract where id = cid);
  assert not exists(select 1 from public.checkin_schedule where contract_id = cid and state = 'planned');
  assert (select state = 'session_created' and session_id = sid from public.checkin_schedule where contract_id = cid and round_key = 'day:7');
  assert (select contract_end_date = (moment + interval '6 months')::date from public.checkin_participant where id = pid);
  rejected := false;
  begin
    perform public.resolve_checkin_contract_change(gid,cid,moment,(moment + interval '8 months')::date,'correction');
  exception when others then rejected := SQLERRM = 'CONTRACT_REVIEW_CONFLICT'; end;
  assert rejected;
  perform public.resolve_checkin_contract_change(gid,cid,moment,(moment + interval '7 months')::date,'correction');
  select id,participant_id into changed_cid,previous_pid from public.checkin_contract where guest_id = gid and state = 'active';
  assert changed_cid <> cid and previous_pid <> pid;
  assert (select logical_contract_id = logical_id from public.checkin_contract where id = changed_cid);
  assert (select count(*) = 1 from public.checkin_schedule where logical_contract_id = logical_id and round_key = 'day:7');
  assert (select contract_id = cid and session_id = sid from public.checkin_schedule where logical_contract_id = logical_id and round_key = 'day:7');
  assert (select count(*) = 1 from public.checkin_schedule where contract_id = changed_cid and round_type = 'monthly-renewal' and state = 'planned');

  update public.checkin_guest set contract_start_date = (moment + interval '7 months')::date, contract_end_date = (moment + interval '13 months')::date where id = gid;
  perform public.resolve_checkin_contract_change(gid,changed_cid,(moment + interval '7 months')::date,(moment + interval '13 months')::date,'renewal');
  select id into cid from public.checkin_contract where guest_id = gid and state = 'active';
  assert (select logical_contract_id <> logical_id and is_renewal from public.checkin_contract where id = cid);
  assert not exists(select 1 from public.checkin_schedule where contract_id = cid and round_type in ('onboarding-d7','monthly-first'));
  assert (select guest_id = gid from public.checkin_participant where id = previous_pid);

  -- Dry-run planning rolls back new schedules/holds. Production source data is never copied here.
  perform public.reconcile_guest_checkin_schedule(gid,(moment + interval '14 months')::date);
  select jsonb_agg(to_jsonb(s) order by id) into expected from public.checkin_schedule s;
  result := public.plan_checkin_schedules(true);
  assert result->>'dryRun' = 'true';
  assert (select jsonb_agg(to_jsonb(s) order by id) from public.checkin_schedule s) = expected;
  assert not exists(select 1 from public.checkin_schedule where contract_id = cid and state = 'planned');
  perform public.plan_checkin_schedules(false);
  assert exists(select 1 from public.checkin_schedule where contract_id = cid and state = 'planned');
  assert not has_table_privilege('anon','public.checkin_schedule','SELECT');
  assert not has_table_privilege('authenticated','public.checkin_contract','SELECT');
  assert not has_function_privilege('anon','public.resolve_checkin_contract_change(uuid,uuid,date,date,text,date)','EXECUTE');
end;
$$;
rollback;
select 'checkin_contract_schedule passed (rolled back)' as result;
