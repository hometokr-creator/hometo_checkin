# 운영자 화면 설정 및 검증 (AD-A~AD-D)

## 구현과 의존성

`@supabase/ssr` 0.12.6을 정확한 버전으로 추가했다. 기존 getDb()는 사용자 세션을 유지하지 않는 privileged DB 클라이언트이므로 운영자 인증에 재사용하지 않는다. SSR 패키지는 쿠키 분할·읽기·갱신을 담당한다.

Next.js 16.3.4 내장 문서에 따라 middleware.ts 대신 src/proxy.ts를 사용한다. 입주자 경로에는 적용하지 않는다. 응답·통계는 보호된 route group에 두어 로그인 페이지에서 운영자 메뉴와 로그아웃을 표시하지 않는다.

로그인 과정: `/admin/login`에서 이메일 입력 → Server Action이 allowlist 확인 후 메일 요청 → 이메일 링크 클릭 → `/admin/auth/confirm`에서 token_hash 검증 → 허용된 사용자에게만 로그인 쿠키 발급 및 `/admin/responses` 이동.

Auth 쿠키는 `/admin` 경로, HttpOnly, SameSite=Lax, HTTPS에서 Secure로 설정한다. 입주자 쿠키와 이름·경로가 다르다. 관리 DB 클라이언트는 기존 server-only getDb()를 유지한다. 서버 조회 및 변경은 requireAdmin()을 먼저 호출해야 한다.

## 사람이 적용할 설정

1. 개발 프로젝트에서 검토 후 `20260908030130_checkin_response_reviewed.sql`을 적용한다. Codex는 DB에 적용하지 않았다.
2. 적용 후 `supabase/tests/checkin_admin_review.sql`을 개발 DB에서 실행한다. 전체 트랜잭션은 rollback된다. 운영 데이터로 테스트하지 않는다.
3. Supabase Authentication에서 Email provider를 활성화한다. 관리자 이메일의 Auth 사용자를 미리 생성한다. 코드가 자동 가입을 하지 않도록 shouldCreateUser=false로 설정했다.
4. 환경별 서버 환경변수에 `SUPABASE_PUBLISHABLE_KEY`와 `CHECKIN_ADMIN_EMAILS`를 넣는다. 후자는 허용 이메일을 콤마로 구분한다. 실제 값은 .env.example에 넣지 않는다.
5. 기존 `SUPABASE_URL`, `CHECKIN_APP_ORIGIN`을 해당 환경에 맞춘다. 후자는 브라우저에서 접속하는 실제 origin이어야 한다.
6. Authentication URL Configuration에서 Site URL 및 허용 Redirect URL을 설정한다. 해당 프로덕션·preview origin의 `/admin/auth/confirm`을 등록한다.
7. Magic Link 이메일 템플릿의 링크를 아래 형식으로 설정한다. 코드가 emailRedirectTo에 인증 완료 URL을 넣으므로 RedirectTo 뒤에 경로를 중복 추가하지 않는다.

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">홈투게더 운영자 로그인</a>
```

8. 실제 운영에는 Custom SMTP를 구성하고 운영자 메일 수신을 검증한다. Supabase 기본 메일 발송은 팀에 속한 수신자 등 제한이 있으므로 allowlist 등록만으로 메일 전송이 보장되지 않는다.
9. Vercel/프록시 접근 로그에서 인증 완료 URL의 token_hash를 마스킹한다. 링크와 쿠키를 분석 로그에 넣지 않는다.
10. 허용 사용자 로그인 → 로그아웃 → 보호 화면 재접근 차단, 만료·재사용 링크 실패를 실제 이메일로 확인한다. 검증 전에는 운영 인증 완료로 간주하지 않는다.

실제 이메일 발송·Auth 사용자 등록·환경변수 주입·SQL 적용·배포는 이번 로컬 작업에서 수행하지 않았다.

## 확인 상태

RPC는 reviewed_at만 변경한다. true 중복 호출은 최초 확인 시각을 보존하고 false는 null로 만든다. 없는 응답은 invalid, null 입력은 invalid-answer로 실패한다. 상세를 여는 GET/RSC에서는 호출하지 않는다. 수동 버튼과 Server Action은 AD-B에서 연결했다.

이 RPC 경로에서 원본은 변경하지 않지만 service_role의 기존 직접 수정 권한을 제거한 것은 아니다. DB 전체 불변성 강화는 이번 범위 밖이다.

## 구현 상태

응답 페이지에는 AD-B의 실제 조회·목록·상세·이력·긴급 미제출·수동 확인 기능과 AD-C 진행 타임라인을 연결했다. AD-D 통계 페이지도 서버 조회와 집계에 연결했다. 실제 운영 연결은 위 수동 설정 후 검증해야 한다.

## AD-B 연결 조건과 검증

- 개발 DB를 읽기 전용으로 점검했으며 reviewed_at 컬럼과 확인 RPC가 아직 없음을 확인했다. SQL은 자동 적용하지 않았다. 미적용 상태는 빈 목록이 아니라 데이터 연결 준비 안내로 표시한다.
- 응답은 RSC에서 service_role로 조회하고 화면에 필요한 DTO만 전달한다. 초기 소규모 운영에 맞춰 전체 정기 응답을 읽어 필터·과거 이력을 제공한다. Supabase 응답 행 제한으로 누락되지 않도록 서버 내부에서 나눠 읽는다. UI 페이지네이션은 없다.
- 상세 열기는 쓰기를 발생시키지 않는다. 수동 버튼만 인증 재검증 → 응답 범위 확인 → 전용 RPC → revalidatePath를 수행한다. 확인 실패는 성공으로 표시하지 않는다.
- 전화번호는 상세에서만 렌더링한다. 화면에는 DB 코드값 대신 한국어 라벨을 표시하고 전체 answers_json·인증키는 클라이언트 DTO에 넣지 않는다. 허용된 운영자에게 상세용 전화번호가 포함된 DTO를 전달하는 것은 조회 권한 범위에 포함된다.
- 가상 데이터를 쓰는 독립 브라우저 fixture는 e2e/admin-ui-entry.tsx에서 실제 UI 컴포넌트를 불러온다. 실제 앱에 테스트 로그인·더미 데이터 API·인증 우회 경로를 추가하지 않는다. scripts/build-admin-ui-fixture.mjs는 기존 Vitest/Vite의 esbuild와 Tailwind 도구를 재사용하며 새 의존성은 추가하지 않았다.
- AD-B 단위 테스트 기준 103개 통과. 브라우저 검증은 수동 확인/해제·이동 시 쓰기 없음·불만 블록 분리·필터·과거 이력·저장 실패를 포함한다.

## AD-C 진행 흐름

- 시나리오에서 질문·선택지, 기존 도메인 정의에서 칩 라벨을 조회한다. 미지원 버전은 해석 불가로 표시한다.
- 진행 이벤트 시각으로 정렬하고 자유어는 해당 태그의 원문 글자 수만 표시한다. ordinal은 사용하지 않는다. 빈 첫 기타가 제거되어도 두 번째 불만의 글자 수를 잘못 연결하지 않는다.
- 기록 없음·알 수 없는 스텝·시각 누락/지연을 명시하고 음수 소요 시간은 계산 불가로 표시한다.
- 단위 테스트 107개 및 빌드 통과. 브라우저 타임라인 검증은 글자 수 표시·원문 비노출·진행 기록 없음 상태를 포함한다.
- 개발 DB에서 실제 PostgREST 조인의 반환 형태를 읽기 전용으로 확인했다. session/response는 객체, issues/interests/progress는 배열임을 확인했으며 고객 값은 출력하지 않았다.

## AD-D 통계

- 최초 발송 성공일의 한국 날짜로 세션을 묶고 조회 시각까지의 결과를 요청마다 집계한다. 발송 중복·취소·이벤트·미래 기록을 제외한다. 시연 세션은 성공 발송 기록이 없어 참여 집계에서 제외되며, 시연 데이터는 개발 DB에만 생성한다.
- 진행 기록이 없는 완료 응답을 별도 표시한다. 완주율은 진행 기록이 있는 세션과 완료 세션의 교집합을 사용해 100% 초과·음수 이탈률을 방지한다.
- 불만 설명은 불만 항목, 자유어 작성은 해당 답변이 있는 완료 세션을 기준으로 각각 집계한다. 초기 긍정 판정과 질문 라벨은 지원하는 시나리오 버전으로 해석한다.
- 작은 표본, 분모 0, 시간 중앙값·사분위수, 30분 초과, 반복 신고, 리마인더 이후 제출, 긴급 미제출, 미완료 기한을 구분한다. 회차별 비교와 기간·회차 필터를 제공한다.
- 실제 개발 DB에 통계용 PostgREST 조회문을 읽기 전용으로 실행해 조인 형태를 확인했다. 고객 값·인증키는 출력하지 않았다.
- 브라우저 통계 검증은 가상 표본 3건·10건·0건과 회차 필터 제출을 포함한다. 실제 고객 데이터로 통계 수치를 검증한 것은 아니다.

## 로컬 검증 (2026-09-08)

- 의존성 설치 및 frozen lockfile 재설치 확인.
- lint, typecheck, production build 통과.
- 단위 테스트 127개 통과: 인증·조회·수동 확인·타임라인·통계 집계 및 기존 입주자 서버 검증.
- 브라우저 테스트 23개 통과: 운영자 인증 3개, 응답·통계 UI 7개 및 기존 입주자 회귀 13개. 실제 이메일 발송 없이 검증했다.
- 브라우저 테스트는 기존 Playwright 사용. agent-browser 실행 파일은 설치돼 있지 않았다.
- 빌드와 개발 서버 검증은 순차 실행한다. 입주자 소스·루트 레이아웃 변경 없음.
- SQL 계약 테스트 파일은 작성만 했으며 실제 DB 실행·메일 로그인·운영 배포 검증은 수동 설정 후 남아 있다.

확정 작업 브랜치: feat/checkin-admin (AD-A~AD-D 공통)
커밋은 AD-A, AD-B, AD-C, AD-D별로 분리한다. 푸시·병합·배포는 수행하지 않는다.

## 참고

- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/auth-smtp
