create function public.create_checkin_session(p_participant_id uuid,p_round_type text,p_round_key text,p_scenario_id text,p_event_type text,p_context jsonb,p_sent_at timestamptz,p_token_digest text) returns uuid language plpgsql security invoker set search_path='' as $$
declare sid uuid;
begin
 if not exists(select 1 from public.checkin_participant where id=p_participant_id and active) then raise exception 'invalid'; end if;
 if length(trim(p_round_key))=0 or p_sent_at is null or p_token_digest is null then raise exception 'invalid-answer'; end if;
 if p_scenario_id <> (case p_round_type when 'monthly' then 'monthly-guest' when 'monthly-first' then 'monthly-first-guest' when 'onboarding-d7' then 'onboarding-d7-guest' when 'monthly-renewal' then 'monthly-renewal-guest' when 'event' then case p_event_type when 'facility' then 'facility-event-guest' when 'rule' then 'rule-event-guest' else '' end else '' end) then raise exception 'invalid-answer'; end if;
 insert into public.checkin_session(participant_id,round_type,round_key,scenario_id,event_type,event_context_snapshot,answer_expires_at)
 values(p_participant_id,p_round_type,p_round_key,p_scenario_id,p_event_type,p_context,p_sent_at+interval '14 days') returning id into sid;
 insert into public.checkin_access_token(session_id,token_digest,expires_at) values(sid,p_token_digest,p_sent_at+interval '14 days');
 return sid;
end;$$;
revoke all on function public.create_checkin_session(uuid,text,text,text,text,jsonb,timestamptz,text) from public,anon,authenticated;
grant execute on function public.create_checkin_session(uuid,text,text,text,text,jsonb,timestamptz,text) to service_role;
