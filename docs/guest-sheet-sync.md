# 게스트_마스터 → Supabase 고객 동기화

기준일: 2026-09-16. 사용자 확정: **계약정보가 완성된 고객만 저장하고 하루 한 번 자동 반영한다.**

## 현재 상태

- 원본: [홈투게더_고객데이터](https://docs.google.com/spreadsheets/d/14FEUBqR5mTd0QiIyW_uYEC2lH2xwbo46D_HNBrd49To/edit), `게스트_마스터` 탭, sheetId `1004515357`.
- 운영 DB: `hometo_checkin` (`rfwxpqekweizestlxomi`). 실제 고객은 이 프로젝트에만 저장한다.
- `checkin_guest`에 계약정보 완성 고객 5명 최초 저장 완료. 대상 ID: G002, G018, G020, G021, G022.
- 필수정보 미완성 17명은 DB에 신규 저장하지 않았으며, ID만 있는 7행도 제외했다.
- G021/G022 종료일은 사용자 확인 및 시트 재조회 결과 `2027-02-28`이다. 메모나 희망기간으로 날짜를 추정하지 않았다.
- 테스트용 `hometogether-admin`에는 동일한 스키마만 적용했다. 검증용 가상 고객·실행 기록은 트랜잭션을 롤백해 남기지 않는다.
- **일일 자동 실행 코드는 구현했지만 아직 활성화되지 않았다. Apps Script 설치·Google 권한 승인과 운영 배포가 남아 있다. 서비스 계정 JSON 키는 필요 없다.** 최초 저장은 연결된 Google Drive 도구로 읽은 스냅샷을 동일한 검증·저장 코드에 전달해 수행했다.

## 저장 조건과 갱신 규칙

필수 항목은 게스트 ID, 이름, 유효한 연락처, 실제 계약 시작일·종료일이다. 종료일은 시작일보다 뒤여야 한다. `계약중` 등 고객상태는 원문을 저장하되, 저장 조건과 실제 발송 대상 조건을 혼동하지 않는다.

| 시트 상태 | 반영 결과 |
| --- | --- |
| 신규 고객의 필수정보 완성 | 고객 UUID를 발급하고 저장 |
| 신규 고객의 날짜·연락처·이름 누락 또는 오류 | 저장하지 않음. 정보를 채우면 다음 동기화에서 다시 판단 |
| 동일 게스트 ID의 정상 정보 변경 | 같은 UUID로 갱신. 특이사항 범주·상세도 각각 반영 |
| 이미 저장된 고객의 필수정보 누락·오류 | 마지막 유효 정보와 UUID를 보존하고 `sync_status=incomplete`로 보류 |
| 이미 저장된 고객의 행 삭제 또는 ID 전용 행으로 변경 | 삭제하지 않고 `sync_status=missing`으로 보류 |
| 보류 고객의 정보 복구 | 같은 UUID로 갱신하고 `ready`로 복구 |
| 비필수 셀을 비움 | 정상 행에서는 해당 항목을 비운 값으로 갱신 |
| 게스트 ID 중복·오류, 헤더 오류, 비어 있는 전체 결과 | 실행 전체를 중단. 기존 고객정보 유지 |
| 늦게 끝난 오래된 읽기 결과 | 이전 동기화 결과를 덮어쓰지 않도록 거절 |

게스트 ID는 고객의 고정 식별자다. ID를 바꾸면 기존 고객은 `missing`, 새 ID는 신규 고객으로 판단하므로 ID 변경은 별도 매핑 작업으로 처리해야 한다.

`ready`는 데이터가 완성됐다는 뜻이다. 실제 발송은 고객상태·퇴실·계약 종료·회차·발송 승인 조건을 추가로 확인하는 후속 기능이다. 동기화는 메시지나 체크인 세션을 생성하지 않는다.

## 데이터 구조와 API

- `checkin_guest`: 고객 UUID/게스트 ID, 정규화한 연락처, 실제 계약 날짜, 고객상태, 특이사항 범주·상세, 시트 원본 필드, 보류 상태, 최근 확인 시각.
- `checkin_guest_sync_run`: 실행 ID, 소스 읽기 시각, 성공/실패, 신규·변경·제외 건수와 개인정보 없는 오류 코드.
- `sync_checkin_guests`: 한 트랜잭션으로 갱신. 중복 실행 방지, 동시 실행 잠금, 오래된 스냅샷 차단.
- `checkin_participant.guest_id`: 고객 UUID를 참조할 수 있는 외래키. **기존 참여자·세션을 실고객에 자동 연결하지 않는다.** 계약 회차 생성 기능에서 이 키를 사용해 연결해야 한다. 과거 응답의 계약정보를 이번 동기화로 덮어쓰지 않는다.

두 새 테이블에는 RLS가 켜져 있고 `anon`/`authenticated` 접근은 차단된다. 기존 운영자 인증을 확인한 서버에서 service role로 조회한다. Supabase REST API 경로는 `/rest/v1/checkin_guest`이며 브라우저에 서버 키를 전달하지 않는다. 동기화 RPC도 service role 전용이다.

운영 화면의 고객·응답 조인, 계약 변경/재계약 이력 해석, 실제 발송 대상 선별은 후속 작업이다. 필수정보가 나중에 불완전해진 고객의 과거 정상 값이 남아 있으므로 조회·일정 생성 시 반드시 `sync_status`와 최근 동기화 성공 여부를 함께 확인한다.

## Apps Script 방식으로 전환 (2026-09-16)

조직 정책이 서비스 계정 JSON 키 생성을 차단하여 사용자가 Apps Script 방식을 선택했다.
운영 경로는 **게스트_마스터 → Apps Script → POST /api/integrations/guest-sheet → 기존 검증·RPC → Supabase**다.
Vercel Cron 설정과 이전 GET Cron API는 제거했다. 서비스 계정 읽기 코드는 수동 CLI용으로만 남아 있으며 자동 실행에는 사용하지 않는다.

### 서버 준비

- 운영 환경의 기존 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 사용한다. 테스트 DB 대상으로는 수신을 거절한다.
- CHECKIN_GUEST_SYNC_SECRET: 암호학적으로 무작위인 32바이트 이상 인증값. NEXT_PUBLIC_ 접두사를 붙이지 않는다.
- CHECKIN_GUEST_SYNC_ENABLED=true: 운영 설정 검증 후 활성화한다.
- 운영 HTTPS 주소에 새 API가 배포되어야 한다. 저장소 규칙에 따라 배포는 별도 사용자 승인 후 진행한다.
- Google 서비스 계정 키·Sheets API 키·CRON_SECRET 설정은 필요 없다.

### 사용자가 Google 계정에서 한 번 할 일

1. 원본 시트에서 **확장 프로그램 → Apps Script**를 연다.
2. 기존 코드가 있다면 보존하고 새 스크립트 파일을 추가한다. scripts/google-apps-script/guest-sync.gs 내용을 붙여 넣고 저장한다.
3. 운영 서버 배포 후 configureGuestSync를 실행한다. Google 권한 요청에서 사용할 계정과 요청 권한을 확인하고 승인한다.
4. 시트에 표시되는 입력창에 운영 HTTPS 주소 + /api/integrations/guest-sheet를 입력하고, 다음 창에 서버와 같은 CHECKIN_GUEST_SYNC_SECRET을 입력한다. 키는 채팅·소스 코드·셀에 넣지 않는다.
5. previewGuests를 실행한다. 저장 없이 완성/미완성/제외 건수를 확인한다. 최초 적재 당시 수치는 완성 5, 미완성 17, ID 전용 7이며 시트 변경에 따라 달라진다.
6. syncGuests를 한 번 실행하고 서버 DB 실행 기록 및 고객 건수를 확인한다.
7. 같은 계정으로 installDailyGuestSync를 한 번 실행한다. 한국 시간 매일 오전 6~7시 사이 실행된다. Google의 시간 기반 트리거는 정확한 분 단위를 보장하지 않는다.
8. 다음 날 Apps Script의 실행 내역과 checkin_guest_sync_run의 최근 성공 기록을 확인한다.

Apps Script를 웹 앱으로 배포할 필요는 없다. 설치형 트리거는 만든 사람의 계정 권한으로 실행된다.
인증값은 그 계정의 User Properties에 저장한다. 프로젝트 편집자는 코드를 바꿀 수 있으므로 시트/스크립트 편집 권한은 신뢰하는 운영자에게만 준다.
운영 담당자 한 명이 트리거를 관리한다. 다른 계정의 트리거는 조회/제거되지 않으므로 담당자 변경 시 이전 계정에서 removeDailyGuestSync를 실행하고 새 계정에서 설정·검증·설치한다.

### 실패와 중지

- removeDailyGuestSync: 현재 계정의 해당 동기화 트리거만 제거한다.
- CHECKIN_GUEST_SYNC_ENABLED=false를 서버에 적용하면 모든 수신이 중단된다.
- Apps Script 실패 실행은 Google 실행 내역/트리거 실패 알림에서 확인한다. 요청이 서버에 도달하지 않으면 DB 실행 기록은 생기지 않는다.
- 수신 API의 검증/DB 오류도 현재는 DB 실패 기록을 별도 생성하지 않으므로 Google 실행 실패와 DB 마지막 성공 시각을 함께 확인한다.
- 응답/로그에는 원본 행과 인증값을 남기지 않는다. 오류는 HTTP 상태 또는 제한된 오류 코드로 표시한다.
- 전체 스냅샷 2MB 상한, 고정 시트 ID/탭 검증, 15분 이내 읽기 시각 검증, 공유 인증값, 명시적 활성화가 필요하다.
- Apps Script의 동시 실행 잠금과 DB의 실행 ID/스냅샷 순서 검증을 함께 사용한다. 실패 시 자동 재전송하지 않고 다음 실행 또는 수동 실행에서 시트를 새로 읽는다.
- Apps Script는 미완성 행도 검증용으로 서버에 보내지만 DB에는 신규 미완성 고객을 저장하지 않는다. 기존 고객 보류 규칙은 동일하다.
- 시트 수정/삭제, 고객 메시지 발송, 체크인 세션 생성은 하지 않는다.

현재는 코드 준비 단계다. 운영 배포, Google 권한 승인, 실제 HTTP 수신 및 다음 일일 실행 검증은 아직 완료되지 않았다.

공식 참고: [설치형 트리거](https://developers.google.com/apps-script/guides/triggers/installable), [시간대 설정](https://developers.google.com/apps-script/reference/script/clock-trigger-builder), [계정별 속성](https://developers.google.com/apps-script/reference/properties/properties-service).

## 검증 기록

- 가져오기·완성 조건·지정 탭 읽기·Apps Script 전송·수신 인증·미리보기 테스트 34개 통과. Google 실제 실행과 배포 후 HTTP 연결은 아직 미검증.
- 테스트 DB의 `supabase/tests/guest_sheet_sync.sql` 통과: 신규 미완성 고객 제외, 중복 실행, 갱신 후 UUID 유지, 기존 고객 보류·누락·복구, 정보 완성 후 추가, 오래된 스냅샷 거절, RLS/권한.
- 운영 최초 저장: 신규 5명, 미완성 제외 17명, ID 전용 행 제외 7개.
- 저장 후 운영 DB 재조회에서 5명의 ID·계약 날짜 일치 확인. 테스트 DB는 고객/실행 기록 모두 0건 확인.
- 변경 파일 ESLint 및 기존 손상 생성 파일 `.next/dev/types/validator.ts` 하나를 제외한 TypeScript 검사 통과. 일반 `tsc --noEmit`은 작업 전부터 있던 해당 캐시 파일의 문법 오류로 실패한다. 사용자 `next-env.d.ts` 변경은 보존했다.
- 보안 점검에서 새 테이블의 RLS/no-policy INFO는 서버 전용 설계에 따른 상태다. [Supabase 설명](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)

공식 근거: [Google 서버 인증](https://developers.google.com/identity/protocols/oauth2/service-account), [Sheets 값 읽기](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get), [Vercel Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [일일 실행 주기·시간 정밀도](https://vercel.com/docs/cron-jobs/usage-and-pricing).
