-- Install only; activation and Vault secret provisioning are separate production steps.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create schema if not exists checkin_private;
revoke all on schema checkin_private from public, anon, authenticated, service_role;

create function checkin_private.invoke_dispatch(p_force boolean default false)
returns bigint language plpgsql security invoker set search_path='' as $$
declare
 local_now timestamp := now() at time zone 'Asia/Seoul';
 dispatch_secret text;
begin
 -- Poll outstanding deliveries at any hour. Otherwise avoid idle HTTP requests.
 if not p_force
 and not exists(select 1 from public.checkin_dispatch_attempt where state in ('accepted','sending'))
 and not (local_now::time >= time '14:00' and local_now::time <= time '18:00'
          and exists(select 1 from public.checkin_dispatch_candidates()))
 and to_char(local_now,'HH24:MI') not in ('14:00','18:01')
 then return null; end if;
 select decrypted_secret into dispatch_secret from vault.decrypted_secrets
 where name='checkin_dispatch_cron_secret';
 if dispatch_secret is null or octet_length(dispatch_secret)<32 then
   raise exception 'CHECKIN_CRON_SECRET_MISSING';
 end if;
 return net.http_get(
   url:='https://checkin.hometogether.kr/api/internal/checkin-dispatch',
   headers:=jsonb_build_object('Authorization','Bearer '||dispatch_secret),
   timeout_milliseconds:=180000
 );
end;
$$;
revoke all on function checkin_private.invoke_dispatch(boolean) from public, anon, authenticated, service_role;
-- Never put the token in cron.job.command. Only the postgres-owned Cron job invokes this function.

