-- Planned dispatch only. No provider requests or cron jobs are enabled here.
alter table public.checkin_session add column delivery_pending boolean not null default false;
create table public.checkin_dispatch_attempt (
 id uuid primary key default gen_random_uuid(),
 schedule_id uuid not null unique references public.checkin_schedule(id),
 session_id uuid not null unique references public.checkin_session(id),
 delivery_id uuid not null unique references public.checkin_delivery(id),
 template_code text not null check(length(template_code) between 1 and 20),
 state text not null check(state in ('sending','accepted','unknown','sent','failed','cancelled')),
 request_id text, recipient_seq integer check(recipient_seq>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((request_id is null)=(recipient_seq is null)),
 check(state not in ('accepted','sent') or request_id is not null)
);
create index checkin_dispatch_poll on public.checkin_dispatch_attempt(updated_at) where state='accepted';
alter table public.checkin_dispatch_attempt enable row level security;
revoke all on public.checkin_dispatch_attempt from public,anon,authenticated;
grant select,insert,update on public.checkin_dispatch_attempt to service_role;

create function public.checkin_dispatch_candidates(p_now timestamptz default now())
returns table(schedule_id uuid,round_type text,scheduled_on date,guest_updated_at timestamptz,display_name text,phone text)
language sql stable security invoker set search_path='' as $$
 select s.id,s.round_type,s.scheduled_on,g.updated_at,g.display_name,g.phone
 from public.checkin_schedule s join public.checkin_contract c on c.id=s.contract_id
 join public.checkin_guest g on g.id=c.guest_id join public.checkin_participant p on p.id=c.participant_id
 where s.state='planned' and s.session_id is null and c.state='active' and p.active
 and g.sync_status='ready' and btrim(g.customer_status) in ('계약중','입주중')
 and (c.contract_start_date,c.contract_end_date)=(g.contract_start_date,g.contract_end_date)
 and s.scheduled_on=(p_now at time zone 'Asia/Seoul')::date and g.contract_end_date>s.scheduled_on
 order by s.scheduled_on,s.id;
$$;
revoke all on function public.checkin_dispatch_candidates(timestamptz) from public,anon,authenticated;
grant execute on function public.checkin_dispatch_candidates(timestamptz) to service_role;

-- One committed attempt per schedule. An uncertain claim must never be blindly repeated.
create function public.claim_checkin_dispatch(p_schedule_id uuid,p_expected_updated_at timestamptz,
 p_template_code text,p_token_digest text,p_now timestamptz default now())
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 s public.checkin_schedule%rowtype; c public.checkin_contract%rowtype; g public.checkin_guest%rowtype;
 sid uuid; did uuid; aid uuid; local_now timestamp := p_now at time zone 'Asia/Seoul';
begin
 if p_now is null or not isfinite(p_now) or p_token_digest is null or p_token_digest !~ '^[a-f0-9]{64}$'
 or p_template_code is null or length(p_template_code) not between 1 and 20 then raise exception 'INVALID_DISPATCH'; end if;
 if local_now::time<time '14:00' or local_now::time>time '18:00' then return null; end if;
 perform pg_advisory_xact_lock(741021005);
 select * into s from public.checkin_schedule where id=p_schedule_id for update;
 if not found or s.state<>'planned' or s.session_id is not null or s.scheduled_on<>local_now::date then return null; end if;
 select * into c from public.checkin_contract where id=s.contract_id;
 select * into g from public.checkin_guest where id=c.guest_id for update;
 if g.updated_at is distinct from p_expected_updated_at then return null; end if;
 perform public.reconcile_guest_checkin_schedule(g.id,local_now::date);
 select * into s from public.checkin_schedule where id=p_schedule_id;
 select * into c from public.checkin_contract where id=s.contract_id;
 if s.state<>'planned' or c.state<>'active' then return null; end if;
 sid := public.create_checkin_session(c.participant_id,s.round_type,'contract:'||c.logical_contract_id||':'||s.round_key,
   s.round_type||'-guest',null,null,p_now-interval '14 days',p_token_digest);
 -- Closed until NHN supplies actual successful delivery time.
 update public.checkin_session set delivery_pending=true where id=sid;
 insert into public.checkin_delivery(session_id,kind,status,requested_at)
 values(sid,'initial','requested',p_now) returning id into did;
 insert into public.checkin_dispatch_attempt(schedule_id,session_id,delivery_id,template_code,state,created_at,updated_at)
 values(s.id,sid,did,p_template_code,'sending',p_now,p_now) returning id into aid;
 update public.checkin_schedule set state='session_created',session_id=sid,hold_reason=null,updated_at=p_now where id=s.id;
 return jsonb_build_object('attemptId',aid,'sessionId',sid,'name',g.display_name,'phone',g.phone);
end;
$$;
revoke all on function public.claim_checkin_dispatch(uuid,timestamptz,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_checkin_dispatch(uuid,timestamptz,text,text,timestamptz) to service_role;

create function public.record_checkin_dispatch_request(p_attempt_id uuid,p_outcome text,
 p_request_id text default null,p_recipient_seq integer default null)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.checkin_dispatch_attempt%rowtype;
begin
 if p_outcome is null or p_outcome not in ('accepted','rejected','unknown') then raise exception 'INVALID_DISPATCH_RESULT'; end if;
 if p_outcome='accepted' and (p_request_id is null or btrim(p_request_id)='' or p_recipient_seq is null or p_recipient_seq<0)
 then raise exception 'INVALID_DISPATCH_REFERENCE'; end if;
 select * into a from public.checkin_dispatch_attempt where id=p_attempt_id for update;
 if not found then raise exception 'DISPATCH_NOT_FOUND'; end if;
 if a.state not in ('sending','unknown') then
   if p_outcome='accepted' and a.request_id is not null and
      (a.request_id,a.recipient_seq) is distinct from (p_request_id,p_recipient_seq)
   then raise exception 'DISPATCH_REFERENCE_CONFLICT'; end if;
   return;
 end if;
 update public.checkin_dispatch_attempt set state=case p_outcome when 'rejected' then 'failed' else p_outcome end,
 request_id=case when p_outcome='accepted' then p_request_id end,
 recipient_seq=case when p_outcome='accepted' then p_recipient_seq end,updated_at=now() where id=a.id;
 if p_outcome='accepted' then
   update public.checkin_delivery set provider_message_id=p_request_id||':'||p_recipient_seq where id=a.delivery_id;
 elsif p_outcome='rejected' then
   update public.checkin_delivery set status='failed',failed_at=now() where id=a.delivery_id;
   update public.checkin_session set status='cancelled',delivery_pending=false where id=a.session_id;
   update public.checkin_access_token set revoked_at=now() where session_id=a.session_id;
 end if;
end;
$$;
revoke all on function public.record_checkin_dispatch_request(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.record_checkin_dispatch_request(uuid,text,text,integer) to service_role;

create function public.record_checkin_dispatch_delivery(p_attempt_id uuid,p_request_id text,p_recipient_seq integer,
 p_outcome text,p_received_at timestamptz default null)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.checkin_dispatch_attempt%rowtype;
begin
 if p_outcome is null or p_outcome not in ('sent','failed','cancelled','pending','unknown') then raise exception 'INVALID_DELIVERY_RESULT'; end if;
 select * into a from public.checkin_dispatch_attempt where id=p_attempt_id for update;
 if not found or (a.request_id,a.recipient_seq) is distinct from (p_request_id,p_recipient_seq)
 or a.request_id is null then raise exception 'DISPATCH_REFERENCE_CONFLICT'; end if;
 -- Terminal results are immutable: repeat polling never extends the deadline.
 if a.state<>'accepted' then return; end if;
 if p_outcome in ('pending','unknown') then
   update public.checkin_dispatch_attempt set updated_at=now() where id=a.id; return;
 end if;
 if p_outcome='sent' then
   if p_received_at is null or not isfinite(p_received_at) or p_received_at<a.created_at-interval '1 minute'
     or p_received_at>now()+interval '5 minutes' then raise exception 'INVALID_DELIVERY_TIME'; end if;
   update public.checkin_delivery set status='sent',sent_at=p_received_at where id=a.delivery_id;
   update public.checkin_session set delivery_pending=false,answer_expires_at=p_received_at+interval '14 days' where id=a.session_id;
   update public.checkin_access_token set expires_at=p_received_at+interval '14 days' where session_id=a.session_id and revoked_at is null;
 else
   update public.checkin_delivery set status='failed',failed_at=now() where id=a.delivery_id;
   update public.checkin_session set status='cancelled',delivery_pending=false where id=a.session_id;
   update public.checkin_access_token set revoked_at=now() where session_id=a.session_id;
 end if;
 update public.checkin_dispatch_attempt set state=p_outcome,updated_at=now() where id=a.id;
end;
$$;
revoke all on function public.record_checkin_dispatch_delivery(uuid,text,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_checkin_dispatch_delivery(uuid,text,integer,text,timestamptz) to service_role;

create function public.maintain_checkin_dispatch(p_now timestamptz default now())
returns void language plpgsql security invoker set search_path='' as $$
declare local_now timestamp := p_now at time zone 'Asia/Seoul';
begin
 if p_now is null or not isfinite(p_now) then raise exception 'INVALID_DISPATCH_TIME'; end if;
 perform pg_advisory_xact_lock(741021005);
 update public.checkin_schedule set state='held',hold_reason='PAST_DUE_REVIEW',updated_at=p_now
 where state='planned' and (scheduled_on<local_now::date or (scheduled_on=local_now::date and local_now::time>time '18:00'));
 update public.checkin_dispatch_attempt set state='unknown',updated_at=p_now
 where state='sending' and created_at<p_now-interval '10 minutes';
end;
$$;
revoke all on function public.maintain_checkin_dispatch(timestamptz) from public,anon,authenticated;
grant execute on function public.maintain_checkin_dispatch(timestamptz) to service_role;
