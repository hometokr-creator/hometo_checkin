-- Integration assertions on the real PostgreSQL functions. All fixtures roll back.
begin;
do $$
declare pid uuid; sid uuid; tid uuid; r jsonb; original jsonb; before_count int; aid uuid;
begin
 insert into public.checkin_participant(display_name,phone,contract_start_date,contract_end_date) values('DB integration fixture','TEST-NOT-A-PHONE',current_date,current_date+365) returning id into pid;
 sid:=public.create_checkin_session(pid,'monthly','fixture-0','monthly-guest',null,null,clock_timestamp(),repeat('1',64));
 select id into tid from public.checkin_access_token where session_id=sid;
 r:=public.submit_checkin_response(sid,tid,'key',repeat('a',64),'{"responses":{"monthlyStatus":"issue","issueTag":"facility","issueDetail":"leak","issueFreeText":"provided","hasAnotherIssue":"yes","secondIssueTag":"settlement","secondIssueDetail":"utilities","secondIssueFreeText":"provided"},"issues":[{"tag":"facility","detail":"leak","freeText":"천장에서 물이 떨어져요.","triageLevel":"R2"},{"tag":"settlement","detail":"utilities","freeText":"이번 달 공과금 내역을 확인하고 싶어요.","triageLevel":"R2"}],"overallTriage":"R2"}'::jsonb,'monthly-guest',1,1);
 if r->>'status'<>'accepted' or r->>'outcome'<>'reported' then raise exception 'wrong outcome 0'; end if;
 if (select answers_json from public.checkin_response where session_id=sid)<>'{"responses":{"monthlyStatus":"issue","issueTag":"facility","issueDetail":"leak","issueFreeText":"provided","hasAnotherIssue":"yes","secondIssueTag":"settlement","secondIssueDetail":"utilities","secondIssueFreeText":"provided"},"issues":[{"tag":"facility","detail":"leak","freeText":"천장에서 물이 떨어져요.","triageLevel":"R2"},{"tag":"settlement","detail":"utilities","freeText":"이번 달 공과금 내역을 확인하고 싶어요.","triageLevel":"R2"}],"overallTriage":"R2"}'::jsonb then raise exception 'answers lost 0'; end if;
 r:=public.submit_checkin_response(sid,tid,'new-key',repeat('a',64),'{"responses":{"monthlyStatus":"issue","issueTag":"facility","issueDetail":"leak","issueFreeText":"provided","hasAnotherIssue":"yes","secondIssueTag":"settlement","secondIssueDetail":"utilities","secondIssueFreeText":"provided"},"issues":[{"tag":"facility","detail":"leak","freeText":"천장에서 물이 떨어져요.","triageLevel":"R2"},{"tag":"settlement","detail":"utilities","freeText":"이번 달 공과금 내역을 확인하고 싶어요.","triageLevel":"R2"}],"overallTriage":"R2"}'::jsonb,'monthly-guest',1,1);
 if r->>'status'<>'duplicate' then raise exception 'duplicate failed'; end if;
 begin
  perform public.submit_checkin_response(sid,tid,'new-key',repeat('b',64),'{"responses":{"monthlyStatus":"issue","issueTag":"facility","issueDetail":"leak","issueFreeText":"provided","hasAnotherIssue":"yes","secondIssueTag":"settlement","secondIssueDetail":"utilities","secondIssueFreeText":"provided"},"issues":[{"tag":"facility","detail":"leak","freeText":"천장에서 물이 떨어져요.","triageLevel":"R2"},{"tag":"settlement","detail":"utilities","freeText":"이번 달 공과금 내역을 확인하고 싶어요.","triageLevel":"R2"}],"overallTriage":"R2"}'::jsonb,'monthly-guest',1,1);
  raise exception 'expected conflict';
 exception when raise_exception then if sqlerrm<>'conflict' then raise;end if;end;
 if (select count(*) from public.checkin_response where session_id=sid)<>1 then raise exception 'duplicate response';end if;
 sid:=public.create_checkin_session(pid,'monthly','fixture-1','monthly-guest',null,null,clock_timestamp(),repeat('2',64));
 select id into tid from public.checkin_access_token where session_id=sid;
 r:=public.submit_checkin_response(sid,tid,'key',repeat('a',64),'{"responses":{"monthlyStatus":"ok","issueTag":"other","issueFreeText":"skipped","hasAnotherIssue":"no"},"issues":[]}'::jsonb,'monthly-guest',1,1);
 if r->>'status'<>'accepted' or r->>'outcome'<>'ok' then raise exception 'wrong outcome 1'; end if;
 if (select answers_json from public.checkin_response where session_id=sid)<>'{"responses":{"monthlyStatus":"ok","issueTag":"other","issueFreeText":"skipped","hasAnotherIssue":"no"},"issues":[]}'::jsonb then raise exception 'answers lost 1'; end if;
 r:=public.submit_checkin_response(sid,tid,'new-key',repeat('a',64),'{"responses":{"monthlyStatus":"ok","issueTag":"other","issueFreeText":"skipped","hasAnotherIssue":"no"},"issues":[]}'::jsonb,'monthly-guest',1,1);
 if r->>'status'<>'duplicate' then raise exception 'duplicate failed'; end if;
 begin
  perform public.submit_checkin_response(sid,tid,'new-key',repeat('b',64),'{"responses":{"monthlyStatus":"ok","issueTag":"other","issueFreeText":"skipped","hasAnotherIssue":"no"},"issues":[]}'::jsonb,'monthly-guest',1,1);
  raise exception 'expected conflict';
 exception when raise_exception then if sqlerrm<>'conflict' then raise;end if;end;
 if (select count(*) from public.checkin_response where session_id=sid)<>1 then raise exception 'duplicate response';end if;
 sid:=public.create_checkin_session(pid,'monthly','fixture-2','monthly-guest',null,null,clock_timestamp(),repeat('3',64));
 select id into tid from public.checkin_access_token where session_id=sid;
 r:=public.submit_checkin_response(sid,tid,'key',repeat('a',64),'{"responses":{"monthlyStatus":"issue","issueTag":"urgent","urgentDetail":"unlocked-door","urgentFreeText":"skipped"},"issues":[{"tag":"urgent","detail":"unlocked-door","triageLevel":"R1"}],"overallTriage":"R1"}'::jsonb,'monthly-guest',1,1);
 if r->>'status'<>'accepted' or r->>'outcome'<>'urgent' then raise exception 'wrong outcome 2'; end if;
 if (select answers_json from public.checkin_response where session_id=sid)<>'{"responses":{"monthlyStatus":"issue","issueTag":"urgent","urgentDetail":"unlocked-door","urgentFreeText":"skipped"},"issues":[{"tag":"urgent","detail":"unlocked-door","triageLevel":"R1"}],"overallTriage":"R1"}'::jsonb then raise exception 'answers lost 2'; end if;
 r:=public.submit_checkin_response(sid,tid,'new-key',repeat('a',64),'{"responses":{"monthlyStatus":"issue","issueTag":"urgent","urgentDetail":"unlocked-door","urgentFreeText":"skipped"},"issues":[{"tag":"urgent","detail":"unlocked-door","triageLevel":"R1"}],"overallTriage":"R1"}'::jsonb,'monthly-guest',1,1);
 if r->>'status'<>'duplicate' then raise exception 'duplicate failed'; end if;
 begin
  perform public.submit_checkin_response(sid,tid,'new-key',repeat('b',64),'{"responses":{"monthlyStatus":"issue","issueTag":"urgent","urgentDetail":"unlocked-door","urgentFreeText":"skipped"},"issues":[{"tag":"urgent","detail":"unlocked-door","triageLevel":"R1"}],"overallTriage":"R1"}'::jsonb,'monthly-guest',1,1);
  raise exception 'expected conflict';
 exception when raise_exception then if sqlerrm<>'conflict' then raise;end if;end;
 if (select count(*) from public.checkin_response where session_id=sid)<>1 then raise exception 'duplicate response';end if;
 sid:=public.create_checkin_session(pid,'event','fixture-3','rule-event-guest','rule','{"type":"rule"}'::jsonb,clock_timestamp(),repeat('4',64));
 select id into tid from public.checkin_access_token where session_id=sid;
 r:=public.submit_checkin_response(sid,tid,'key',repeat('a',64),'{"responses":{"ruleEventStatus":"needs-help","freeText":"skipped"},"issues":[{"tag":"other","triageLevel":"R2"}],"overallTriage":"R2"}'::jsonb,'rule-event-guest',1,1);
 if r->>'status'<>'accepted' or r->>'outcome'<>'reported' then raise exception 'wrong outcome 3'; end if;
 if (select answers_json from public.checkin_response where session_id=sid)<>'{"responses":{"ruleEventStatus":"needs-help","freeText":"skipped"},"issues":[{"tag":"other","triageLevel":"R2"}],"overallTriage":"R2"}'::jsonb then raise exception 'answers lost 3'; end if;
 r:=public.submit_checkin_response(sid,tid,'new-key',repeat('a',64),'{"responses":{"ruleEventStatus":"needs-help","freeText":"skipped"},"issues":[{"tag":"other","triageLevel":"R2"}],"overallTriage":"R2"}'::jsonb,'rule-event-guest',1,1);
 if r->>'status'<>'duplicate' then raise exception 'duplicate failed'; end if;
 begin
  perform public.submit_checkin_response(sid,tid,'new-key',repeat('b',64),'{"responses":{"ruleEventStatus":"needs-help","freeText":"skipped"},"issues":[{"tag":"other","triageLevel":"R2"}],"overallTriage":"R2"}'::jsonb,'rule-event-guest',1,1);
  raise exception 'expected conflict';
 exception when raise_exception then if sqlerrm<>'conflict' then raise;end if;end;
 if (select count(*) from public.checkin_response where session_id=sid)<>1 then raise exception 'duplicate response';end if;
 sid:=public.create_checkin_session(pid,'event','fixture-4','facility-event-guest','facility','{"type":"facility","itemName":"에어컨"}'::jsonb,clock_timestamp(),repeat('5',64));
 select id into tid from public.checkin_access_token where session_id=sid;
 r:=public.submit_checkin_response(sid,tid,'key',repeat('a',64),'{"responses":{"facilityEventStatus":"resolved","freeText":"provided"},"issues":[{"tag":"other","freeText":"생활 규칙에 대해 문의하고 싶어요.","triageLevel":"R2"}],"freeText":"생활 규칙에 대해 문의하고 싶어요.","overallTriage":"R2"}'::jsonb,'facility-event-guest',1,1);
 if r->>'status'<>'accepted' or r->>'outcome'<>'reported' then raise exception 'wrong outcome 4'; end if;
 if (select answers_json from public.checkin_response where session_id=sid)<>'{"responses":{"facilityEventStatus":"resolved","freeText":"provided"},"issues":[{"tag":"other","freeText":"생활 규칙에 대해 문의하고 싶어요.","triageLevel":"R2"}],"freeText":"생활 규칙에 대해 문의하고 싶어요.","overallTriage":"R2"}'::jsonb then raise exception 'answers lost 4'; end if;
 r:=public.submit_checkin_response(sid,tid,'new-key',repeat('a',64),'{"responses":{"facilityEventStatus":"resolved","freeText":"provided"},"issues":[{"tag":"other","freeText":"생활 규칙에 대해 문의하고 싶어요.","triageLevel":"R2"}],"freeText":"생활 규칙에 대해 문의하고 싶어요.","overallTriage":"R2"}'::jsonb,'facility-event-guest',1,1);
 if r->>'status'<>'duplicate' then raise exception 'duplicate failed'; end if;
 begin
  perform public.submit_checkin_response(sid,tid,'new-key',repeat('b',64),'{"responses":{"facilityEventStatus":"resolved","freeText":"provided"},"issues":[{"tag":"other","freeText":"생활 규칙에 대해 문의하고 싶어요.","triageLevel":"R2"}],"freeText":"생활 규칙에 대해 문의하고 싶어요.","overallTriage":"R2"}'::jsonb,'facility-event-guest',1,1);
  raise exception 'expected conflict';
 exception when raise_exception then if sqlerrm<>'conflict' then raise;end if;end;
 if (select count(*) from public.checkin_response where session_id=sid)<>1 then raise exception 'duplicate response';end if;
 -- Interest sequence, immutable first topics, and independence.
 begin perform public.record_checkin_interest(sid,tid,'clicked');raise exception 'expected invalid-answer'; exception when raise_exception then if sqlerrm<>'invalid-answer' then raise;end if;end;
 perform public.record_checkin_interest(sid,tid,'exposed');
 perform public.record_checkin_interest(sid,tid,'clicked');
 original:=public.record_checkin_interest(sid,tid,'topics-submitted',array[]::text[]);
 r:=public.record_checkin_interest(sid,tid,'topics-submitted',array['host']);
 if r<>original or r->'topics'<>'[]'::jsonb or r->>'topicsSubmittedAt' is null then raise exception 'first topics changed';end if;
 if (select status from public.checkin_session where id=sid)<>'completed' then raise exception 'completion lost';end if;
 -- Fresh open session: no interest, progress deduplication, expired/revoked access.
 sid:=public.create_checkin_session(pid,'monthly','fixture-open','monthly-guest',null,null,clock_timestamp(),repeat('6',64));
 select id into tid from public.checkin_access_token where session_id=sid;
 begin perform public.record_checkin_interest(sid,tid,'exposed');raise exception 'expected not-completed'; exception when raise_exception then if sqlerrm<>'not-completed' then raise;end if;end;
 perform public.record_checkin_progress(sid,tid,'monthly-guest','q_main');perform public.record_checkin_progress(sid,tid,'monthly-guest','q_main');
 if (select count(*) from public.checkin_progress_event where session_id=sid)<>1 then raise exception 'progress duplicate';end if;
 -- A failed issue insert must roll back the response insert and completion.
 begin
  perform public.submit_checkin_response(sid,tid,'bad',repeat('a',64),'{"responses":{},"issues":[{"tag":"unknown"}]}'::jsonb,'monthly-guest',1,1);
  raise exception 'expected check violation';
 exception when check_violation then null;end;
 if exists(select 1 from public.checkin_response where session_id=sid) or (select status from public.checkin_session where id=sid)<>'open' then raise exception 'partial submission saved';end if;
 update public.checkin_session set answer_expires_at=clock_timestamp()-interval '1 second' where id=sid;
 begin perform public.submit_checkin_response(sid,tid,'expired',repeat('a',64),'{"responses":{},"issues":[]}'::jsonb,'monthly-guest',1,1);raise exception 'expected expired';exception when raise_exception then if sqlerrm<>'expired' then raise;end if;end;
 update public.checkin_access_token set revoked_at=clock_timestamp() where id=tid;
 begin perform public.record_checkin_progress(sid,tid,'monthly-guest','q_tag');raise exception 'expected invalid';exception when raise_exception then if sqlerrm<>'invalid' then raise;end if;end;
 if has_table_privilege('anon','public.open_issues','select') or has_function_privilege('anon','public.submit_checkin_response(uuid,uuid,text,text,jsonb,text,integer,integer)','execute') then raise exception 'public privilege leak';end if;
end;$$;
rollback;
select 'checkin database integration assertions passed' as result;
