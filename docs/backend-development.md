# 체크인 백엔드 개발·운영 준비

> 2026-09-08 환경 변경 결정: hometo_checkin은 운영용으로 지정했다. 아래의 개발 프로젝트/Preview 연결 설명은 이전 상태 기록이다. 테스트 쓰기는 해당 프로젝트에서 차단하며, 새 환경 구성 상태와 실행 조건은 [운영·테스트 환경 분리](test-environment.md)를 우선한다.

BE-A~D만 구현합니다. 이번 개발에는 실제 고객 정보가 필요하지 않습니다. 알림톡 발송·상담원 알림·AWS 연동은 구현 범위 밖입니다.

## 환경

Node 24, pnpm 11.20.0. 서버 전용 값은 .env.example을 참고해 .env.local에 저장합니다. 키를 Git이나 채팅에 넣지 않습니다.
개발 프로젝트: hometo_checkin (rfwxpqekweizestlxomi). 기존 hometogether-admin은 사용하지 않습니다.
Docker가 준비되지 않은 현재 환경에서는 원격 개발 프로젝트로 DB 검증합니다. 로컬 스택은 Docker 설치 후 Supabase CLI의 start 도움말을 확인해 실행할 수 있습니다.

## 마이그레이션

supabase/migrations가 스키마의 단일 원본입니다. 첫 마이그레이션은 §18.7 원문 뒤에 RLS, 권한, CHECK 제약을 추가했습니다. MCP 적용 결과의 실제 버전으로 로컬 파일을 맞췄습니다.
새 마이그레이션은 pnpm exec supabase migration new 명령으로 생성합니다. 원격 적용 뒤 실제 migration history와 파일 버전을 맞춥니다. 공유 DB를 reset하지 않습니다.
브라우저 역할에 권한·RLS 정책을 부여하지 않는 것이 의도입니다. service_role만 접근합니다. advisor의 rls_enabled_no_policy INFO는 이 접근 모델에서 예상됩니다.

## 고객 데이터 (운영 준비 시 입력)

아직 입력하지 않아도 됩니다. checkin_participant에 이름(display_name), 전화번호(phone), 계약 시작일(contract_start_date), 종료일(contract_end_date)을 입력합니다. 선택값은 건물/호실 표시(property_label), 집주인 이름(host_name), 외부 계약 참조(external_contract_ref), 메모(memo)입니다.
테스트는 seed.sql의 가상 입주자로 진행합니다. 발송 기능은 없으며 TEST-NOT-A-PHONE은 발송 가능한 번호가 아닙니다. 실고객을 넣기 전에 개발과 운영 프로젝트를 분리합니다.

## 토큰·로그

토큰은 다이제스트만 DB에 보관합니다. 링크와 쿠키는 접근 자격이므로 로그에 남기지 않습니다. Vercel/프록시의 URL 접근 로그 마스킹은 실제 배포 설정에서도 확인해야 합니다.

## 현재 검증

스키마 8개 테이블의 RLS 및 anon/authenticated 접근 차단, open_issues 뷰 권한을 원격 DB에서 확인했습니다. API와 DB를 연결해 A~E 저장, 동일·상이 본문 동시 제출, 새 키 우회 차단, 서버 트리아지, 만료·폐기, 관심·진행 이벤트 분리를 검증했습니다. 단위 테스트 70개와 브라우저 회귀 테스트 13개가 통과했습니다. Vercel Preview 배포 및 실제 HTTPS API·DB 검증도 완료했습니다. 카카오 인앱 실기기 검증은 남아 있습니다.

## 수동 테스트 링크 만들기

1. Supabase Table Editor에서 가상 입주자의 id를 확인합니다. 실제 고객 정보는 아직 필요 없습니다.
2. Git에서 제외되는 artifacts/private/session-input.json에 아래 형식으로 저장합니다.

```json
{
  "participantId": "입주자 UUID",
  "roundType": "monthly",
  "roundKey": "manual-test-2026-09-07-1",
  "sentAt": "2026-09-07T03:00:00.000Z"
}
```

3. node scripts/create-checkin-session.mjs artifacts/private/session-input.json을 실행합니다.
4. 출력된 artifacts/private/<세션 UUID>.json 파일의 url을 엽니다. 원문 토큰은 이 비공개 파일에만 남습니다.

sentAt은 테스트 기준 시각이며 실제 발송을 수행하지 않습니다. 응답·토큰 마감은 sentAt+14일입니다. 같은 participantId+roundKey를 다시 발급하면 오류가 나며 새 세션으로 리마인더를 만들지 않습니다. 이벤트 회차는 eventContext: {type:"facility",itemName:"에어컨"} 또는 {type:"rule"}이 추가로 필요합니다.

## 검증 실행

- pnpm lint / pnpm typecheck / pnpm test / pnpm build
- pnpm test:e2e: 13개 프론트 회귀 시나리오. e2e/mock-checkin-api.ts에서만 테스트 응답을 주입하며 실제 API는 demo 토큰을 허용하지 않습니다.
- node scripts/test-backend.mjs: 실행 중인 http://127.0.0.1:3100 서버에 실제 요청을 보내는 DB 통합 검증. 서버를 시작할 때 CHECKIN_APP_ORIGIN=http://127.0.0.1:3100으로 맞춥니다. 다른 테스트 주소는 CHECKIN_TEST_ORIGIN으로 지정합니다. 전용 개발 프로젝트·로컬 DB에서만 실행합니다. 종료 시 이번 실행의 임시 데이터만 정리하고, 브라우저 검증용 가상 세션 한 개를 artifacts/private/browser-session.json에 남깁니다.
- supabase/tests/checkin_contract.sql: SQL 함수·롤백·권한 검증. 트랜잭션 마지막에 rollback하여 테스트 데이터를 남기지 않습니다.

## API 운영 규칙

POST /api/checkin/access에서 원문 토큰을 교환하고 세션별 HttpOnly 쿠키를 발급합니다. GET /api/checkin/session?sessionId=...는 그 세션 쿠키로 조회합니다. 서로 다른 세션의 탭이 쿠키를 덮어쓰지 않습니다. 쿠키는 원래 토큰 기한을 넘기지 않습니다.
응답은 /api/checkin/sessions/<id>/answer, 관심은 interest-events, 진행은 progress-events에 각각 POST합니다. 관심의 실험 키는 community-interest:v1, variant는 empathy-v1, 수치 훅은 NULL입니다. 주제는 최초 제출을 유지합니다. 진행 기록은 동일 세션·스텝당 한 번이며 설문 완료 직전 전송되어 뒤늦게 도착한 유효 요청도 수용합니다.
같은 본문 재시도는 duplicate, 다른 본문은 409, 최초 응답 마감은 410입니다. 객체 키 순서와 재시도 키는 본문 해시에서 제외하고, 이슈 배열 순서·내부 문장 변경은 구분합니다. 자유어 앞뒤 공백과 CRLF는 정규화합니다.

## 키 보관

.env.example은 빈 값의 양식만 커밋합니다. 실제 서비스 키·쿠키 서명 비밀값은 .env.local과 Vercel 서버 환경변수에만 둡니다. 예제 파일이 채워지면 configuration.test.ts가 실패합니다. 이번 작업 중 예제 파일에 입력됐던 키는 로컬 커밋에서 제거했으며 원격 푸시는 하지 않았습니다. 2026-09-07에 새 Secret key로 교체하고 Legacy API Keys를 비활성화했습니다. 이전 키의 DB 접근은 HTTP 401, 새 키는 HTTP 200으로 검증했습니다. 이전 Git 객체에 남은 키도 더 이상 접근할 수 없습니다.

## Vercel 테스트 배포 준비

대상은 HomeTogether 팀의 hometogether-checkin-web 프로젝트입니다. Preview 환경에 개발 DB를 연결하고 실제 고객 정보는 넣지 않습니다. `.vercelignore`로 환경변수 파일, Git 객체, 비공개 테스트 링크·결과를 업로드에서 제외합니다.

필요한 서버 환경변수는 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CHECKIN_ACCESS_SECRET, CHECKIN_APP_ORIGIN입니다. SUPABASE_SERVICE_ROLE_KEY에는 새 Secret key를 사용합니다. 쿠키 서명 비밀값은 배포용으로 별도 생성하며, CHECKIN_APP_ORIGIN은 테스트에 사용할 정확한 HTTPS 주소로 지정합니다. 로컬 `.env.local`을 환경변수 내려받기로 덮어쓰지 않습니다.

프로젝트에 연결된 GitHub 저장소는 hometokr-creator/hometogether-checkin-web이고 현재 로컬 origin은 bigmansinwoo-coder/hometogether-checkin-web입니다. 자동 배포 기준을 정하기 전에는 동일한 저장소라고 가정하지 않으며, 이번 테스트는 로컬 소스를 CLI로 배포합니다. 배포 보호는 유지합니다.

### 2026-09-07 배포 결과

- Preview: https://hometogether-checkin-test.vercel.app
- 배포 ID: dpl_5KiYztwq7H7HCkBsNsM9HEs81GH8 (READY)
- 기준 구현: codex/checkin-backend, 6fc92d7 및 배포 제외 설정. 로컬 CLI 업로드이며 Git push·운영 배포는 하지 않았습니다.
- Next.js 16.3.4 / Node 24, 빌드 22초, 함수 지역 icn1.
- Preview 서버 환경변수 4개를 등록했습니다. Vercel 연결 시 로컬에 추가된 OIDC 값 외에 기존 개발 환경변수는 보존됐습니다.
- HTTPS API와 개발 DB를 연결해 A~E, 동시 제출, 멱등·충돌, 권한·만료, 서버 트리아지, 관심·진행 이벤트 분리를 검증했습니다.
- 실제 브라우저에서 긴급 칩 → 자유어 → 완료 → 관심 주제 제출 및 새로고침을 확인했습니다. DB 결과는 urgent/R1, 관심 주제 daily-life이며 진행 이벤트는 q_main, q_tag, q_chip_urgent, q_free_urgent입니다. 브라우저 오류는 없었습니다.
- 휴대폰용 새 가상 세션 2개는 Git·배포에서 제외되는 artifacts/private/mobile-test-links.md에 있습니다. 체크인 토큰 14일과 별개로 Vercel 공유 접근은 약 1일 유효합니다. 만료 시 공식 공유 접근을 재발급합니다.
- 아직 실제 카카오 인앱 실기기 검증, 운영 로그의 토큰 경로 마스킹, 자동 배포용 GitHub 저장소 정리는 완료하지 않았습니다. 고객 등록·발송은 진행하지 않았습니다.
