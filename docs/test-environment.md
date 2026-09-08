# 운영·테스트 환경 분리

2026-09-08 사용자 확정: 기존 hometo_checkin을 운영용으로 유지하고 테스트 DB를 별도로 구성한다.

## 환경 계약

- 운영 프로젝트: rfwxpqekweizestlxomi. 테스트 스크립트는 이 주소의 쓰기를 거부한다.
- 테스트 DB: 생성 방식/조직 결정 대기. 이 PC의 Docker 명령 및 기본 설치 경로는 현재 확인되지 않았다.
- DB 구조는 supabase/migrations를 같은 순서로 적용한다. 운영 고객·응답·토큰·Auth 사용자·인증키는 복사하지 않는다.
- 가상 고객은 supabase/seed.sql을 테스트 DB에만 적용한다. 실제 전화번호와 실제 발송은 사용하지 않는다.
- Auth 사용자·매직링크 템플릿·리다이렉트·환경변수는 테스트용으로 별도 설정한다.
- .env.local의 기존 인증키/주소는 아직 변경하지 않았다. 운영/Preview 배포 환경도 아직 전환하지 않았다.

## 테스트 실행

테스트 앱과 scripts/test-backend.mjs는 동일한 테스트 DB와 CHECKIN_APP_ORIGIN을 사용해야 한다.
SUPABASE_URL 및 CHECKIN_TEST_SUPABASE_URL에 동일한 테스트 DB origin을 설정한다.
SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY, CHECKIN_ACCESS_SECRET은 테스트용 값만 사용한다.
기존 .env.local을 그대로 쓴 통합 테스트는 운영 주소 차단으로 중단되는 것이 정상이다.

운영 DB와 동일한 스키마/RLS/함수를 검증한 뒤 가상 고객으로 토큰 발급·응답 저장·운영자 조회를 확인한다.
실제 고객 동기화는 테스트 환경의 전체 흐름 검증 이후 별도 단계다.

## 남은 전환 작업

1. 테스트 DB 생성 및 마이그레이션 적용, 가상 데이터 입력.
2. 로컬 앱과 Preview 연결을 테스트 DB로 전환하고 운영용 연결은 분리.
3. 기존 가상 기록 정리 범위를 확인한 뒤 운영 준비. 현재 운영 프로젝트의 데이터는 삭제하지 않았다.
4. 테스트 결과와 실제 적용한 프로젝트/설정을 이 문서에 기록.
