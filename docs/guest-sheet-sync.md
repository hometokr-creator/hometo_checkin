# 게스트_마스터 → Supabase 고객 동기화

기준일: 2026-09-16. 사용자 확정: **계약정보가 완성된 고객만 저장하고 하루 한 번 자동 반영한다.**

## 현재 상태

- 원본: [홈투게더_고객데이터](https://docs.google.com/spreadsheets/d/14FEUBqR5mTd0QiIyW_uYEC2lH2xwbo46D_HNBrd49To/edit), `게스트_마스터` 탭, sheetId `1004515357`.
- 운영 DB: `hometo_checkin` (`rfwxpqekweizestlxomi`). 실제 고객은 이 프로젝트에만 저장한다.
- `checkin_guest`에 계약정보 완성 고객 5명 최초 저장 완료. 대상 ID: G002, G018, G020, G021, G022.
- 필수정보 미완성 17명은 DB에 신규 저장하지 않았으며, ID만 있는 7행도 제외했다.
- G021/G022 종료일은 사용자 확인 및 시트 재조회 결과 `2027-02-28`이다. 메모나 희망기간으로 날짜를 추정하지 않았다.
- 테스트용 `hometogether-admin`에는 동일한 스키마만 적용했다. 검증용 가상 고객·실행 기록은 트랜잭션을 롤백해 남기지 않는다.
- **일일 자동 실행 코드는 구현했지만 아직 활성화되지 않았다. Google 서비스 계정의 시트 읽기 권한과 운영 배포가 남아 있다.** 최초 저장은 연결된 Google Drive 도구로 읽은 스냅샷을 동일한 검증·저장 코드에 전달해 수행했다.

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

## Google 읽기 권한 준비

1. Google Cloud에서 서비스 계정을 만들고 **Google Sheets API**를 사용 설정한다.
2. 해당 서비스 계정의 JSON 키를 발급한다. 키 파일은 채팅이나 Git에 넣지 않는다. 로컬 보관이 필요하면 Git에서 제외된 `artifacts/private/`에 둔다.
3. 원본 스프레드시트의 공유 설정에 서비스 계정 `client_email`을 **뷰어**로 추가한다. 파일을 공개할 필요는 없다.
4. Git에서 제외되는 `.env.google-sheets`에 다음 두 값을 입력한다. `private_key`의 줄바꿈은 `\n`으로 입력할 수 있다.

```dotenv
GOOGLE_SERVICE_ACCOUNT_EMAIL=서비스계정의_client_email
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="서비스계정의_private_key"
```

현재 대화의 Google Drive 연결은 최초 읽기에 사용했다. 앱 서버의 일일 실행은 별도의 서비스 계정으로 인증한다. 코드는 `spreadsheets.readonly` 권한으로 지정한 스프레드시트의 지정 탭만 읽는다.

## 직접 실행

환경 파일을 명시해야 하며 기본 동작은 미리보기다. 기존 `.env.local`에 저장된 운영 DB 연결을 재사용한다.

```powershell
pnpm checkin:sync-guests --env=.env.local --google-env=.env.google-sheets --expect-project=rfwxpqekweizestlxomi
pnpm checkin:sync-guests --env=.env.local --google-env=.env.google-sheets --expect-project=rfwxpqekweizestlxomi --apply
```

최초 적재처럼 연결 도구로 확인한 전체 스냅샷을 사용하는 경우 `--snapshot=artifacts/private/guest-sheet-snapshot.json`을 지정할 수 있다. 스냅샷에는 정확한 spreadsheetId/sheetId/title/readAt/values가 있어야 한다. 이미 처리한 시각의 스냅샷을 새 실행 ID로 재적용하면 거절되므로, 다시 동기화할 때는 시트를 새로 읽는다. 테스트 DB를 대상으로 실고객 가져오기 명령을 실행하면 거절된다.

출력은 대상 건수와 실행 ID뿐이다. 원문 이름·전화번호·메모·인증키는 출력하지 않는다.

## 하루 한 번 자동 반영 활성화

Vercel Cron 스킬과 공식 문서를 참고해 `/api/cron/sync-guests`와 `vercel.json`을 구성했다. 기본 시각은 **한국 시간 매일 오전 6시**다. Hobby 환경에서는 해당 시간대 안에서 실행 시각이 달라질 수 있다. 시트 동기화 시간이며 알림톡 발송 시간과는 별도다.

운영 배포의 환경변수:

- 기존 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: 운영 프로젝트 값.
- 위 Google 인증값 2개.
- `CRON_SECRET`: 별도로 생성한 32바이트 이상 비밀값.
- `CHECKIN_GUEST_SYNC_ENABLED=true`: 읽기 및 미리보기 검증 후 활성화.

Preview와 로컬에서는 기본적으로 활성화하지 않는다. 실고객 읽기는 운영 프로젝트를 대상으로만 허용한다. 운영 배포 전에 연결된 Vercel 프로젝트·Git 저장소와 DB 환경을 확인한다. 배포는 저장소 규칙에 따라 별도 사용자 승인을 받은 뒤 진행한다.

활성화 완료 조건: 서비스 계정으로 미리보기 성공 → 운영 배포 → 인증된 동기화 요청 성공 → `checkin_guest_sync_run` 기록 확인 → 다음 일일 실행 성공 확인. 지금은 Google 인증과 운영 배포 단계가 남아 있다.

일시 중지는 `CHECKIN_GUEST_SYNC_ENABLED=false`로 설정해 적용한다. 실행 실패 시 기존 고객을 지우지 않으며, 마지막 성공 시각과 오류 코드를 확인한다. 시트 탭 변경, 전체 빈 결과, 크기 상한 초과는 자동 추정하지 않고 실패 처리한다.

## 검증 기록

- 가져오기·완성 조건·지정 탭 읽기·오류 비노출·Cron 인증 테스트 26개 통과.
- 테스트 DB의 `supabase/tests/guest_sheet_sync.sql` 통과: 신규 미완성 고객 제외, 중복 실행, 갱신 후 UUID 유지, 기존 고객 보류·누락·복구, 정보 완성 후 추가, 오래된 스냅샷 거절, RLS/권한.
- 운영 최초 저장: 신규 5명, 미완성 제외 17명, ID 전용 행 제외 7개.
- 저장 후 운영 DB 재조회에서 5명의 ID·계약 날짜 일치 확인. 테스트 DB는 고객/실행 기록 모두 0건 확인.
- 변경 파일 ESLint 및 기존 손상 생성 파일 `.next/dev/types/validator.ts` 하나를 제외한 TypeScript 검사 통과. 일반 `tsc --noEmit`은 작업 전부터 있던 해당 캐시 파일의 문법 오류로 실패한다. 사용자 `next-env.d.ts` 변경은 보존했다.
- 보안 점검에서 새 테이블의 RLS/no-policy INFO는 서버 전용 설계에 따른 상태다. [Supabase 설명](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)

공식 근거: [Google 서버 인증](https://developers.google.com/identity/protocols/oauth2/service-account), [Sheets 값 읽기](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get), [Vercel Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [일일 실행 주기·시간 정밀도](https://vercel.com/docs/cron-jobs/usage-and-pricing).
