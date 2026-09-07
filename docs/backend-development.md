# 체크인 백엔드 개발·운영 준비

BE-A~D만 구현합니다. 실제 고객, 알림톡, 상담원 알림, AWS 연동은 필요하지 않습니다.

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

스키마 8개 테이블의 RLS 및 anon/authenticated 접근 차단, open_issues 뷰 권한을 원격 DB에서 확인했습니다. 후속 API 검증 결과는 단계별로 추가합니다.
