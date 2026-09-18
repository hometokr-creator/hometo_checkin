-- LOCAL ONLY: synthetic participants, never real phone numbers. No delivery is sent.
insert into public.checkin_participant(display_name,phone,contract_start_date,contract_end_date,external_contract_ref,memo)
select '개발 입주자', 'TEST-NOT-A-PHONE', date '2026-01-01', date '2026-12-31', 'dev-fixture', '가상 데이터 / 발송 금지'
where not exists (select 1 from public.checkin_participant where external_contract_ref='dev-fixture');
