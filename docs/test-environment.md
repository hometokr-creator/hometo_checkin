# 운영·테스트 환경 분리

2026-09-08 사용자 확정: 기존 hometo_checkin을 운영용으로 유지하고 테스트 DB를 별도로 구성한다.

## 환경 계약

- 운영 프로젝트: rfwxpqekweizestlxomi. 테스트 스크립트는 이 주소의 쓰기를 거부한다.
- 테스트 DB: 기존 hometogether-admin 프로젝트(qgqnktipmmamzowbxcmg)의 public.checkin_* 테이블. 기존 다른 기능의 테이블과 DB 자원/Auth 설정을 공유하므로 프로젝트 전체 초기화는 금지한다.
- DB 구조는 supabase/migrations를 같은 순서로 적용한다. 운영 고객·응답·토큰·Auth 사용자·인증키는 복사하지 않는다.
- 가상 고객은 supabase/seed.sql을 테스트 DB에만 적용한다. 실제 전화번호와 실제 발송은 사용하지 않는다.
- Auth 사용자·매직링크 템플릿·리다이렉트·환경변수는 테스트용으로 별도 설정한다.
- .env.local의 기존 인증키/주소는 아직 변경하지 않았다. 운영/Preview 배포 환경도 아직 전환하지 않았다.

## 적용 및 검증 결과 (2026-09-08)

- 사용자 승인으로 테스트 프로젝트에 기존 마이그레이션 5개를 순서대로 묶어 `20260908081814_isolated_checkin_test_bootstrap`으로 적용했다. 운영용 원본 마이그레이션을 중복 생성하지 않는다.
- 운영/테스트의 8개 체크인 테이블 컬럼·기본값·nullable 지문이 일치한다. 5개 RPC의 공백 제외 본문·인자·security invoker·search_path도 일치한다.
- supabase/seed.sql의 가상 입주자 1명 입력. 테스트 전화번호는 TEST-NOT-A-PHONE이다.
- checkin_contract.sql 및 checkin_admin_review.sql을 테스트 프로젝트에서 실행해 통과했다. 검증용 행은 rollback됐으며 seed만 유지한다.
- 체크인 8개 테이블의 RLS 활성화 및 공개 역할 접근 차단 확인. advisor의 RLS/no-policy INFO는 서버 전용 접근 설계에 따른 것이다.
- 기존 다른 서비스의 데이터·Storage·Auth 설정은 수정하지 않았다. 운영 프로젝트에도 쓰지 않았다.
- 로컬 CLI 로그인 부재로 서버 키 자동 조회는 불가능했으나 사용자가 `.env.checkin-test`의 서버 키를 직접 입력했다. 로컬 SDK→테스트 DB 읽기 HTTP 200 확인. 파일은 Git 제외이며 운영 연결 `.env.local`은 보존했다.
- `test:backend:test-db` 통과: A~E 응답 저장, 동일/상이 본문 동시 제출, 재시도 충돌, 관심/진행 기록, 서버 트리아지, 접근 권한, 만료/폐기.
- Playwright에서 로그인 화면 렌더링 및 가상 고객 월간 설문 제출→완료→재방문 중복 차단 확인. 브라우저 오류 0건. DB 조인으로 가상 고객 응답 1건 보존 확인.
- 기존 `.next/dev` 캐시 손상으로 최초 API가 404를 반환했다. 이번 실행의 서버만 종료하고 해당 개발 캐시를 재생성해 해결했다. 전체 TypeScript 검사도 통과했다.
- 아직 실제 이메일을 통한 운영자 로그인·보호된 응답 화면 조회, Preview 연결 전환은 완료하지 않았다. 이메일을 발송하거나 공유 Auth 설정을 바꾸지 않았다.

## 테스트 실행

테스트 앱과 scripts/test-backend.mjs는 동일한 테스트 DB와 CHECKIN_APP_ORIGIN을 사용해야 한다. 전용 실행 명령은 `.env.checkin-test`를 명시적으로 읽는다.
SUPABASE_URL 및 CHECKIN_TEST_SUPABASE_URL에 동일한 테스트 DB origin을 설정한다.
SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY, CHECKIN_ACCESS_SECRET은 테스트용 값만 사용한다.
기존 .env.local을 그대로 쓴 통합 테스트는 운영 주소 차단으로 중단되는 것이 정상이다.

1. Git 제외 파일 `.env.checkin-test`의 SUPABASE_SERVICE_ROLE_KEY에 hometogether-admin의 서버 키를 입력한다. 키는 채팅에 붙여넣지 않는다.
2. `pnpm dev:test-db`: 127.0.0.1:3100에서 테스트 앱 실행. 필수 값이 비어 있거나 DB 주소가 다르면 시작을 거부한다.
3. 별도 터미널에서 `pnpm test:backend:test-db`: 같은 파일의 연결로 가상 데이터 통합 검증.
4. 검증 스크립트는 자신이 생성한 세션 ID만 정리하며, 수동 확인용 가상 세션 하나는 artifacts/private/browser-session.json에 남긴다.

공유 프로젝트이므로 `supabase db reset`, 무차별 `db push`, 운영 레포 기준 `db pull`로 다른 기능의 스키마/이력을 덮어쓰지 않는다. 후속 체크인 변경은 검토한 SQL만 개별 적용하고 적용 버전과 원본 파일 대응을 기록한다.

운영 DB와 동일한 스키마/RLS/함수를 검증한 뒤 가상 고객으로 토큰 발급·응답 저장·운영자 조회를 확인한다.
실제 고객 동기화는 테스트 환경의 전체 흐름 검증 이후 별도 단계다.

## 남은 전환 작업

1. 테스트 운영자 로그인 연결 검토. 기존 공유 Auth의 이메일 템플릿은 임의 변경하지 않는다. Preview 전환은 별도 배포 요청 범위에서 진행.
2. 기존 가상 기록 정리 범위를 확인한 뒤 운영 준비. 현재 운영 프로젝트의 데이터는 삭제하지 않았다.
3. 후속 검증 결과와 실제 적용한 설정을 이 문서에 기록.
