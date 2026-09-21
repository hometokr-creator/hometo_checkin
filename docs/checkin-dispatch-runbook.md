# 계약 체크인 발송 및 전달 기한

2026-09-19 확정: 한국 시간 매일 14:00(주말·공휴일 포함). 지연 실행은 같은 날 18:00:00까지 허용한다. 이후 미발송 회차는 PAST_DUE_REVIEW로 보류하며 다음 날 자동 소급 발송하지 않는다.

설문 기한은 NHN의 실제 전달 성공 시각(receiveDate)부터 정확히 14일이다. API 접수 시각이나 결과를 조회한 시각을 사용하지 않는다. 전달 성공 전 세션은 delivery_pending이며 접근 시 503을 반환한다. 같은 결과를 반복 조회해도 만료 시각은 바뀌지 않는다. 전달 시각이 누락되거나 잘못된 결과는 자동 활성화하지 않는다.

## 구현과 실행 상태

- 회사 저장소: hometokr-creator/hometo_checkin, codex/contract-checkin-schedule.
- 테스트 DB에 checkin_dispatch 마이그레이션 적용 및 가상 데이터 롤백 검증 완료.
- 운영 DB에는 이번 마이그레이션 미적용. 실제 발송·예약 호출은 활성화하지 않았다.
- GET /api/internal/checkin-dispatch: 32바이트 이상 CRON_SECRET을 Bearer 인증으로 전달한다. 응답에는 집계만 포함한다.
- CHECKIN_DISPATCH_MODE 기본 disabled. dry-run은 후보 조회만 수행하고 DB를 변경하거나 NHN을 호출하지 않는다.
- test는 NHN_ALIMTALK_TEST_SEND_ENABLED=true 및 NHN_ALIMTALK_TEST_RECIPIENTS 허용 목록이 모두 필요하다.
- live는 VERCEL_ENV=production, 운영 Supabase URL, NHN_ALIMTALK_LIVE_SEND_ENABLED=true가 모두 필요하다. Preview 발송은 차단한다.
- NHN_ALIMTALK_APPROVED_TEMPLATE_CODES 설정 외에도 실제 NHN 승인(TSC03), 차단·휴면 해제, 이름 변수 및 CHECKIN_APP_ORIGIN/c/#{token} 버튼을 검증한다.
- 각 호출은 최대 3건 발송, 기존 접수 최대 3건 결과 조회. 테스트 규모 기준이며 고객 수 증가 시 배치 용량·호출 주기를 함께 조정해야 한다. 후보 조회 상한은 1,000건이다.
- 발송 시간이 지나도 접수된 메시지 결과 조회는 계속 수행해야 한다. 결과 조회 후 링크가 활성화되므로 스케줄러 호출 간격만큼 지연될 수 있다.

## 배포 및 실제 발송 전 순서

1. NHN 템플릿 네 종류의 실제 승인, 링크 도메인과 변수 확인.
2. 테스트 DB 및 허용된 담당자 번호로 접수 → 전달 결과 조회 → 링크 → 설문 저장까지 검증.
3. 운영 DB 마이그레이션 적용 후 disabled 또는 dry-run 배포. 계약중·입주중 대상과 일정 건수를 대조한다.
4. 운영 환경 인증값과 네 가지 템플릿 코드를 설정한다. 승인된 운영 전환 시에만 live 및 발송 스위치를 켠다.
5. 인증된 스케줄러에서 한국 시간 14시에 첫 호출하고 이후 짧은 주기로 호출한다. 18시 이후에도 보류 처리 및 전달 결과 조회를 위해 호출을 유지한다.
   Vercel Hobby는 하루 1회·시간 단위 실행 오차 때문에 이 반복 호출 요구에 맞지 않는다. Vercel Pro 또는 별도 서버 스케줄러를 선택한 후 등록한다. 현재 vercel.json에 자동 호출을 등록하지 않았다.
6. 후보·접수·실제 전달·unknown·보류 건수를 운영 모니터링에 연결한다. 503, unknown 또는 남은 후보는 운영자가 확인한다.

## 중복과 불확실한 결과

일정당 DB 발송 시도는 한 번만 생성하며 토큰 원문은 저장하지 않는다. 동시 실행은 DB에서 선점한다. 발송 호출의 타임아웃이나 결과 저장 실패는 자동 재발송하지 않는다. sending이 10분 지나면 unknown으로 전환한다.

unknown은 NHN 콘솔에서 attemptId 그룹키를 조회해 접수 여부를 확인한다. 접수가 확인되면 해당 requestId·recipientSeq를 record_checkin_dispatch_request에 accepted로 기록하고 정상 결과 조회로 복구한다. 접수 여부가 불명확한 상태에서 새 메시지를 보내거나 일정 상태를 planned로 되돌리지 않는다. failed/cancelled는 링크를 폐기하며 자동 재시도하지 않는다.

서비스 역할만 새 테이블과 RPC를 사용할 수 있다. 익명·일반 로그인 역할 접근은 차단했다. 공유 테스트 프로젝트의 기존 다른 앱 SECURITY DEFINER 경고는 이번 변경 대상이 아니다([Supabase 설명](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)).

## 검증

- Vitest: NHN 전달 시각·승인 확인, 시간 경계, dry-run, 접수와 전달 분리, 중복 선점, 불확실 결과 무재시도, Cron 인증.
- scripts/test-checkin-dispatch.sql: 테스트 DB에서만 실행. 가상 고객 생성 후 중복 선점 차단·실제 전달 +14일·반복 조회 만료 불변·익명 권한을 검사하고 전체 롤백한다. 한국 시간 14:02 이후 실행한다.
- 운영 환경에서 가상 검증 SQL을 실행하지 않는다.

## 2026-09-21 단건 수신 테스트

- NHN 템플릿 4종의 실제 승인(TSC03) 확인. 기존 vercel.app 링크 유지.
- 등록된 담당자 테스트 번호에 onboarding-d7 1건 발송, NHN COMPLETED 및 성공 코드 1000 확인.
- 운영 주소와 같은 DB에 실제 고객과 연결되지 않은 가상 참여자/세션 1건을 만들어 수동 검증했다. 정기 발송 파이프라인 전체 검증이나 운영 활성화를 의미하지 않는다.
- 실제 수신 2026-09-21 14:25:42 KST, 만료 2026-10-05 14:25:42 KST. 이번 단건의 전달 기록과 만료는 확인 후 수동 반영했다.
- 운영 access API 200 및 해당 가상 세션 매칭 확인. 담당자의 링크 클릭·설문 제출 및 운영 화면 확인은 후속 단계다.
- 실제 NHN receiveDate에 소수점이 포함되는 사례를 확인해 파서를 수정하고 소수점·유효하지 않은 날짜 회귀 테스트를 추가했다.
- 자동 발송과 도메인 전환은 활성화하지 않았다. 이번 가상 참여자는 guest_id가 없어 시트 기반 자동 일정 대상에 포함되지 않는다.
