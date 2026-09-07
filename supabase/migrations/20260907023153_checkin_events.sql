create function public.record_checkin_interest(p_session_id uuid,p_token_id uuid,p_type text,p_topics text[] default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.checkin_session; t public.checkin_access_token; r public.checkin_interest;
begin
 select * into s from public.checkin_session where id=p_session_id for update;
 if not found or s.status='cancelled' then raise exception 'invalid'; end if;
 select * into t from public.checkin_access_token where id=p_token_id and session_id=s.id for share;
 if not found or t.revoked_at is not null then raise exception 'invalid'; end if;
 if t.expires_at<=clock_timestamp() then raise exception 'expired'; end if;
 perform id from public.checkin_participant where id=s.participant_id and active for share;
 if not found then raise exception 'invalid'; end if;
 if s.status<>'completed' or not exists(select 1 from public.checkin_response where session_id=s.id) then raise exception 'not-completed'; end if;
 if p_type is null or p_type not in ('exposed','clicked','topics-submitted') or p_topics is null or array_position(p_topics,null) is not null or not (p_topics <@ array['kitchen','daily-life','cleaning','host','costs','other']::text[]) or cardinality(p_topics)>6 or cardinality(p_topics)<>(select count(distinct topic) from unnest(p_topics) topic) or (p_type<>'topics-submitted' and cardinality(p_topics)>0) then raise exception 'invalid-answer'; end if;
 insert into public.checkin_interest(session_id,variant_key) values(s.id,'empathy-v1') on conflict(session_id,experiment_key) do nothing;
 select * into r from public.checkin_interest where session_id=s.id and experiment_key='community-interest:v1' for update;
 if p_type='exposed' and r.exposed_at is null then r.exposed_at:=clock_timestamp(); end if;
 if p_type='clicked' then
  if r.exposed_at is null then raise exception 'invalid-answer'; end if;
  if r.clicked_at is null then r.clicked:=true;r.clicked_at:=clock_timestamp(); end if;
 end if;
 if p_type='topics-submitted' then
  if r.clicked_at is null then raise exception 'invalid-answer'; end if;
  if r.topics_submitted_at is null then r.topics:=p_topics;r.topics_submitted_at:=clock_timestamp(); end if;
 end if;
 update public.checkin_interest set exposed_at=r.exposed_at,clicked=r.clicked,clicked_at=r.clicked_at,topics=r.topics,topics_submitted_at=r.topics_submitted_at where id=r.id;
 return jsonb_strip_nulls(jsonb_build_object('sessionId',s.id,'clicked',r.clicked,'topics',r.topics,'createdAt',r.created_at,'exposedAt',r.exposed_at,'clickedAt',r.clicked_at,'topicsSubmittedAt',r.topics_submitted_at));
end;$$;
revoke all on function public.record_checkin_interest(uuid,uuid,text,text[]) from public,anon,authenticated;
grant execute on function public.record_checkin_interest(uuid,uuid,text,text[]) to service_role;

create function public.record_checkin_progress(p_session_id uuid,p_token_id uuid,p_scenario_id text,p_step_id text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.checkin_session; t public.checkin_access_token;
begin
 select * into s from public.checkin_session where id=p_session_id for share;
 if not found or s.status='cancelled' then raise exception 'invalid'; end if;
 select * into t from public.checkin_access_token where id=p_token_id and session_id=s.id for share;
 if not found or t.revoked_at is not null then raise exception 'invalid'; end if;
 if t.expires_at<=clock_timestamp() or (s.status='open' and s.answer_expires_at<=clock_timestamp()) then raise exception 'expired'; end if;
 perform id from public.checkin_participant where id=s.participant_id and active for share;
 if not found then raise exception 'invalid'; end if;
 if p_scenario_id is distinct from s.scenario_id or p_step_id is null or length(p_step_id) not between 1 and 80 then raise exception 'invalid-answer'; end if;
 insert into public.checkin_progress_event(session_id,scenario_id,step_id) values(s.id,s.scenario_id,p_step_id) on conflict(session_id,step_id) do nothing;
 return jsonb_build_object('status','recorded');
end;$$;
revoke all on function public.record_checkin_progress(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_checkin_progress(uuid,uuid,text,text) to service_role;
