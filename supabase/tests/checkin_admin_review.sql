-- Run manually in the development DB after the AD-A migration. No persistent data.
begin;
set local role service_role;
do $$
declare
  pid uuid; sid uuid; rid uuid; original jsonb; first_review timestamptz;
begin
  insert into public.checkin_participant(display_name, phone, contract_start_date, contract_end_date)
    values('AD-A 테스트', 'TEST-NOT-A-PHONE', current_date, current_date + 30) returning id into pid;
  insert into public.checkin_session(participant_id,round_type,round_key,scenario_id,status,completed_at,answer_expires_at)
    values(pid,'monthly','admin-review-test','monthly-guest','completed',now(),now()+interval '14 days') returning id into sid;
  insert into public.checkin_response(session_id,schema_version,scenario_id,scenario_version,triage_rule_version,idempotency_key,request_hash,answers_json,outcome)
    values(sid,1,'monthly-guest',1,1,'admin-review-test',repeat('a',64),'{"responses":{},"issues":[]}'::jsonb,'ok') returning id into rid;
  select to_jsonb(r)-'reviewed_at' into original from public.checkin_response r where id=rid;
  if (select reviewed_at from public.checkin_response where id=rid) is not null then raise exception 'unexpected default'; end if;
  first_review := public.mark_checkin_response_reviewed(rid,true);
  if first_review is null then raise exception 'review not recorded'; end if;
  -- A sentinel proves preservation even inside one transaction, where now() is constant.
  update public.checkin_response set reviewed_at=now()-interval '1 day' where id=rid;
  first_review := public.mark_checkin_response_reviewed(rid,true);
  if first_review is distinct from now()-interval '1 day' then raise exception 'first review overwritten'; end if;
  perform public.mark_checkin_response_reviewed(rid,false);
  if (select reviewed_at from public.checkin_response where id=rid) is not null then raise exception 'unreview failed'; end if;
  if (select to_jsonb(r)-'reviewed_at' from public.checkin_response r where id=rid) is distinct from original then raise exception 'response payload changed'; end if;
  begin
    perform public.mark_checkin_response_reviewed(gen_random_uuid(),true);
    raise exception 'missing response silently accepted';
  exception when raise_exception then if sqlerrm <> 'invalid' then raise; end if; end;
  begin
    perform public.mark_checkin_response_reviewed(rid,null);
    raise exception 'null silently accepted';
  exception when raise_exception then if sqlerrm <> 'invalid-answer' then raise; end if; end;
  if has_function_privilege('anon','public.mark_checkin_response_reviewed(uuid,boolean)','execute')
     or has_function_privilege('authenticated','public.mark_checkin_response_reviewed(uuid,boolean)','execute') then
    raise exception 'public execution granted';
  end if;
end;
$$;
rollback;
