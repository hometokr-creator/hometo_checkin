# 계약 기준 체크인 일정

기준일: 2026-09-18. 고객 동기화 이후의 예정 회차를 만든다. 발송 시각, NHN Cloud 요청, 토큰 발급 및 응답 만료 시작은 다음 발송 연동 단계다.

## 사용자 확정 규칙

| 항목 | 규칙 |
| --- | --- |
| 대상 | sync_status=ready, 고객상태가 계약중 또는 입주중, 실제 계약 종료일이 오늘 이후 |
| 시작 기준 | 시트의 실제 계약 시작일. 별도 입주일을 추측하지 않음 |
| 신규 계약 | 시작일 +7일, +1개월 첫 달, 이후 월간 |
| 마지막 회차 | 종료일 **전** 마지막 월간 날짜에 재계약 체크인으로 대체 |
| 종료일 | 종료일 당일과 이후 신규 회차 없음 |
| 월말 | 시작일의 일자를 매번 기준으로 해당 월 말일 보정. 1/31 → 2/28 → 3/31 |
| 첫 월간=마지막 월간 | 재계약 체크인으로 대체 |
| 월간 없는 짧은 계약 | +7일이 종료일 전인 경우에만 온보딩. 7일 이하 계약은 회차 없음 |
| 재계약 | +7일·첫 달 생략. 새 계약 시작일 +1개월부터 일반 월간, 마지막은 재계약 |
| 지난 회차 | 첫 일정 생성일 이전 회차를 소급 생성하지 않음. 기존 미발송 회차가 지난 경우 지연 발송 정책 확정 전 PAST_DUE_REVIEW로 보류 |
| 고객상태 빈 값/매칭중/퇴실 등 | 신규 일정 보류. 기존 미발송 일정도 보류 |
| 시트 계약 날짜 변경 | 자동 정정/재계약 추론 금지. 기존 계약 review_required, 미발송 일정 held |

예: 2026-02-18~2027-02-18 신규 계약은 2/25 온보딩, 3/18 첫 달, 이후 매월 18일, 마지막 2027-01-18 재계약이다. 1/19(종료 30일 전)이나 종료일 당일에는 별도 회차를 만들지 않는다.

## 데이터 연결

- `checkin_guest`: 최신 고객 8개 항목과 동기화 상태.
- `checkin_contract`: 고객 UUID, 계약 날짜 스냅샷, 체크인 참여자 UUID, 논리 계약 ID, 정정/재계약 분류, 이전 계약, 최초 계획일.
- `checkin_participant.guest_id`: 명시적 고객 UUID 연결. 동명이인이나 변경된 전화번호로 추측 매칭하지 않음.
- `checkin_schedule`: 계약별 회차 키, 예정 날짜, 설문 종류, planned/held/cancelled/session_created 상태, 향후 세션 ID 연결 지점.
- `checkin_session → checkin_response`: 기존 응답 구조 유지. 일정 생성 시 미리 세션·토큰을 만들지 않아 14일 응답 기한이 조기 시작되지 않는다.

한 고객의 현재 계약은 부분 유일 인덱스로 1개만 허용한다. 각 계약의 참여자에는 당시 이름·연락처·계약 날짜를 스냅샷으로 남긴다. 최신 고객 원본 변경으로 과거 응답 맥락을 덮어쓰지 않는다.
운영 응답의 과거 이력은 연결된 고객 UUID가 있으면 이를 기준으로 묶고, 기존 미연결 가상 참여자는 이전처럼 참여자 UUID를 사용한다.

### 정정과 재계약

- 정정: 새 계약 스냅샷/참여자를 만들되 `logical_contract_id` 유지. 미사용 회차는 같은 회차 키로 재계산하고, 이미 session_id가 있는 회차는 다시 만들거나 덮어쓰지 않는다.
- 재계약: 새 `logical_contract_id`로 새 회차를 만든다. 이전 계약 미발송 일정은 cancelled, 기존 세션·응답은 유지한다.
- `unique(logical_contract_id, round_key)`가 재실행/정정 중복을 막는다. 날짜와 회차 키를 혼동하지 않는다. 월말 보정·날짜 정정에도 month:1 등 업무 키는 유지한다.
- 정정/재계약 확정은 최신 고객 날짜와 예상 계약 ID를 다시 비교한다. 미리보기 후 시트가 바뀌면 CONTRACT_REVIEW_CONFLICT로 거절한다.
- 시트가 원래 날짜로 돌아와도 한 번 review_required가 된 계약은 운영자가 명시적으로 해결한다.

## 실행 방식

DB의 고객 insert/update 트리거가 같은 트랜잭션에서 일정을 갱신한다. 기존 Apps Script/서버의 동기화 RPC를 그대로 사용할 수 있다.
고객 동기화와 일정 조정은 같은 advisory lock을 사용한다. 미완성·누락 고객의 상태 변경도 반영한다. 일정 생성 실패 시 해당 동기화 트랜잭션이 롤백되므로 성공 응답에 일부 일정만 누락되는 상태를 만들지 않는다.

신규 테이블은 RLS가 켜져 있고 anon/authenticated 직접 접근은 금지한다. 모든 일반 RPC는 SECURITY INVOKER이며 service_role만 실행 가능하다. 공개 웹 API나 스케줄 실행용 인증값을 새로 만들지 않는다.

### 로컬 날짜 계산만 확인

```powershell
pnpm checkin:preview-contract --start=2026-02-18 --end=2027-02-18 --from=2026-09-18
pnpm checkin:preview-contract --start=2027-02-18 --end=2028-02-18 --from=2027-02-18 --renewal
```

DB나 고객 데이터를 읽지 않는다. TypeScript 캘린더와 SQL 캘린더 모두 동일한 월말·윤년·마지막 월간 규칙을 테스트한다.

### DB 전체 일정 미리보기

```powershell
pnpm checkin:plan-schedules --env=.env.checkin-test --expect-project=qgqnktipmmamzowbxcmg
```

운영 적용 승인 및 마이그레이션 이후에는 다음 명령을 사용할 수 있다.

```powershell
pnpm checkin:plan-schedules --env=.env.local --expect-project=rfwxpqekweizestlxomi
```

기본은 dry-run이다. DB 내부 하위 트랜잭션에서 계산하고 롤백한다. 계약/일정 변경은 남지 않는다. 콘솔에는 건수와 보고서 경로만 표시하고, 고객 ID·날짜·회차 목록은 gitignored `artifacts/private/checkin-schedule-*.json`에 저장한다.
미리보기에서 새로 만들어진 계약 UUID는 임시 값이므로 실제 수정 대상 ID로 사용하지 않는다. 저장된 review_required 계약의 ID는 정정 입력에 사용할 수 있다.

보고서의 `contracts`에서 저장된 날짜·현재 시트 날짜·review_required를 확인하고 `schedules`에서 예정일·종류·보류 사유를 확인한다. 전체 일정을 실제 저장하려면 동일 명령에 `--apply`를 붙인다. 실제 발송은 하지 않는다.

### 날짜 변경을 정정/재계약으로 확정

현재는 운영자 전용 CLI 경로다. 웹 운영 화면의 승인 버튼은 후속 UI 작업이다.
아래 형태의 JSON을 `artifacts/private/contract-resolution.json`에 작성한다. 값은 최신 미리보기의 실제 UUID와 날짜를 사용한다.

```json
{
  "guestUuid": "고객 내부 UUID",
  "expectedContractId": "현재 review_required 계약 UUID",
  "expectedStart": "현재 시트 실제 계약 시작일 YYYY-MM-DD",
  "expectedEnd": "현재 시트 실제 계약 종료일 YYYY-MM-DD",
  "kind": "correction"
}
```

재계약은 kind를 `renewal`로 지정한다. 해당 계약의 실제 새 시작일/종료일이 시트에 입력돼 있어야 한다.

```powershell
pnpm checkin:plan-schedules --env=.env.checkin-test --expect-project=qgqnktipmmamzowbxcmg --resolution=artifacts/private/contract-resolution.json --apply
```

운영에서는 승인된 운영 환경 파일/프로젝트를 명시한다. 이 명령은 계약 확정 후 전체 일정도 다시 조정한다. 원시 공급자 오류나 고객 행을 콘솔에 출력하지 않는다.

## 적용 및 검증 상태

- 회사 저장소 최신 dev에서 `codex/contract-checkin-schedule` 브랜치로 개발.
- 테스트 Supabase에 마이그레이션 적용 완료, SQL 검증은 가상 데이터 사용 후 전체 롤백.
- 기존 고객 동기화 SQL 테스트도 새 트리거가 있는 상태에서 통과.
- Vitest 관련 78개, 명령 옵션 테스트 2개 통과. 수정 파일 ESLint 및 기존 손상 `.next/dev/types/validator.ts`를 제외한 타입 검사 통과.
- 실제 테스트 DB 인증정보로 CLI 미리보기 성공: 고객 0명·계획 0건. 가상 일정 데이터를 남기지 않음.
- 운영 DB 적용은 자동 승인 검토에서 명시적 운영 배포 승인이 필요하다는 이유로 거절되어 아직 미적용. 우회 실행하지 않음.
- 현재 확인된 운영 고객 5명은 매칭중 1명/상태 빈 값 4명이다. 승인된 대상 조건에 따라 현재 생성 대상은 0명이다. 고객상태를 임의로 바꾸지 않는다.
- 운영 화면의 고객 UUID 이력 연결 코드는 새 웹 배포가 필요하다. 운영 로그인/실제 발송 후 응답 매칭 검증은 아직 하지 않았다.
- 공유 테스트 DB의 기존 Auth/타 기능 경고는 그대로이며 새 테이블의 RLS/no-policy INFO는 서버 전용 설계에 따른 상태다.

## NHN Cloud 연동 시 남은 결정

발신프로필·템플릿 승인, 발송 시각과 휴일 처리, 지연 허용, 공급자 요청·결과/재시도, 실제 발송 시점의 세션/토큰 발급·14일 기한을 연결해야 한다.
발송 직전에는 고객 상태·동기화 상태·계약 스냅샷 일치·예정 날짜·이미 생성된 session_id를 다시 확인하고 같은 잠금/고유키 아래에서 세션을 연결해야 한다. planned는 발송 승인이 아니다.
실제 발송은 승인된 테스트 번호로 별도 검증한다.
