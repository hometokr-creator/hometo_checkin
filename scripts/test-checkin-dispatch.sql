begin;
do $$
declare gid uuid; sid uuid; aid uuid; schedule uuid; stamp timestamptz; result jsonb;
today date := (now() at time zone 'Asia/Seoul')::date;
at14 timestamptz := ((now() at time zone 'Asia/Seoul')::date+time '14:00') at time zone 'Asia/Seoul';
received timestamptz;
begin
insert into public.checkin_guest(guest_id,source_row,display_name,phone,contract_start_date,contract_end_date,customer_status,last_seen_at)
values('G999999999',99999,'가상 테스트','01000000000',today-7,today+90,'입주중',now()) returning id,updated_at into gid,stamp;
select s.id into schedule from public.checkin_schedule s join public.checkin_contract c on c.id=s.contract_id where c.guest_id=gid and s.round_key='day:7';
if schedule is null then raise exception 'NO_TEST_SCHEDULE'; end if;
if public.claim_checkin_dispatch(schedule,stamp,'hometo_d7_v1',repeat('a',64),at14-interval '1 second') is not null then raise exception 'EARLY_SEND'; end if;
result:=public.claim_checkin_dispatch(schedule,stamp,'hometo_d7_v1',repeat('a',64),at14);
aid:=(result->>'attemptId')::uuid;sid:=(result->>'sessionId')::uuid;
if aid is null then raise exception 'CLAIM_FAILED'; end if;
if public.claim_checkin_dispatch(schedule,stamp,'hometo_d7_v1',repeat('b',64),at14) is not null then raise exception 'DUPLICATE_SEND'; end if;
perform public.record_checkin_dispatch_request(aid,'accepted','fake-provider-request',1);
if not (select delivery_pending from public.checkin_session where id=sid) then raise exception 'PREMATURE_ACTIVATION'; end if;
received:=at14+interval '2 minutes';
perform public.record_checkin_dispatch_delivery(aid,'fake-provider-request',1,'sent',received);
if not exists(select 1 from public.checkin_session where id=sid and not delivery_pending and answer_expires_at=received+interval '14 days') then raise exception 'WRONG_SESSION_DEADLINE'; end if;
if not exists(select 1 from public.checkin_access_token where session_id=sid and expires_at=received+interval '14 days') then raise exception 'WRONG_TOKEN_DEADLINE'; end if;
perform public.record_checkin_dispatch_delivery(aid,'fake-provider-request',1,'sent',received+interval '1 minute');
if (select answer_expires_at from public.checkin_session where id=sid)<>received+interval '14 days' then raise exception 'DEADLINE_EXTENDED'; end if;
if has_function_privilege('anon','public.claim_checkin_dispatch(uuid,timestamp with time zone,text,text,timestamp with time zone)','EXECUTE') then raise exception 'PUBLIC_DISPATCH'; end if;
end $$;
rollback;
select 'delivery deadline and duplicate prevention passed; fixtures rolled back' as result;