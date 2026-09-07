create function public.submit_checkin_response(p_session_id uuid,p_token_id uuid,p_key text,p_hash text,p_answers jsonb,p_scenario_id text,p_scenario_version int,p_triage_version int) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.checkin_session; t public.checkin_access_token; existing public.checkin_response; rid uuid; issue jsonb; normalized jsonb; triage text; result_outcome text; idx int:=0;
begin
 select * into s from public.checkin_session where id=p_session_id for update;
 if not found or s.status='cancelled' then raise exception 'invalid'; end if;
 select * into t from public.checkin_access_token where id=p_token_id and session_id=s.id for share;
 if not found or t.revoked_at is not null then raise exception 'invalid'; end if;
 if t.expires_at<=clock_timestamp() then raise exception 'expired'; end if;
 perform id from public.checkin_participant where id=s.participant_id and active for share;
 if not found then raise exception 'invalid'; end if;
 if s.scenario_id<>p_scenario_id or s.scenario_version<>p_scenario_version or s.triage_rule_version<>p_triage_version then raise exception 'invalid-answer'; end if;
 select * into existing from public.checkin_response where session_id=s.id;
 if found then
  if existing.request_hash<>p_hash then raise exception 'conflict'; end if;
  return jsonb_build_object('status','duplicate','outcome',existing.outcome);
 end if;
 if s.status<>'open' then raise exception 'conflict'; end if;
 if s.answer_expires_at<=clock_timestamp() then raise exception 'expired'; end if;
 if p_key is null or length(trim(p_key)) not between 1 and 200 or p_hash is null or jsonb_typeof(p_answers->'issues') is distinct from 'array' or jsonb_array_length(p_answers->'issues')>2 then raise exception 'invalid-answer'; end if;
 select coalesce(jsonb_agg(value || jsonb_build_object('triageLevel',case when value->>'tag'='urgent' then 'R1' else 'R2' end) order by ord),'[]'::jsonb) into normalized from jsonb_array_elements(p_answers->'issues') with ordinality as x(value,ord);
 triage:=case when exists(select 1 from jsonb_array_elements(normalized) i where i->>'tag'='urgent') then 'R1' when jsonb_array_length(normalized)>0 then 'R2' else null end;
 result_outcome:=case when triage='R1' then 'urgent' when triage='R2' then 'reported' else 'ok' end;
 p_answers:=jsonb_set(p_answers-'overallTriage','{issues}',normalized);
 if triage is not null then p_answers:=p_answers||jsonb_build_object('overallTriage',triage); end if;
 insert into public.checkin_response(session_id,schema_version,scenario_id,scenario_version,triage_rule_version,idempotency_key,request_hash,answers_json,outcome,overall_triage)
 values(s.id,1,s.scenario_id,s.scenario_version,s.triage_rule_version,p_key,p_hash,p_answers,result_outcome,triage) returning id into rid;
 for issue in select value from jsonb_array_elements(normalized) loop
  idx:=idx+1;
  insert into public.checkin_issue(response_id,ordinal,tag,detail,free_text,reported_triage) values(rid,idx,issue->>'tag',issue->>'detail',issue->>'freeText',issue->>'triageLevel');
 end loop;
 update public.checkin_session set status='completed',completed_at=clock_timestamp() where id=s.id;
 return jsonb_build_object('status','accepted','outcome',result_outcome);
end;$$;
revoke all on function public.submit_checkin_response(uuid,uuid,text,text,jsonb,text,int,int) from public,anon,authenticated;
grant execute on function public.submit_checkin_response(uuid,uuid,text,text,jsonb,text,int,int) to service_role;
