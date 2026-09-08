# 운영자 인증 설정 (AD-A)

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

RPC는 reviewed_at만 변경한다. true 중복 호출은 최초 확인 시각을 보존하고 false는 null로 만든다. 없는 응답은 invalid, null 입력은 invalid-answer로 실패한다. 상세를 여는 GET/RSC에서는 호출하지 않는다. 수동 버튼과 Server Action 연결은 AD-B에서 구현한다.

이 RPC 경로에서 원본은 변경하지 않지만 service_role의 기존 직접 수정 권한을 제거한 것은 아니다. DB 전체 불변성 강화는 이번 범위 밖이다.

## 다음 단계

AD-A의 응답/통계 페이지는 인증 확인용 준비 화면이다. 실제 조회·집계 데이터가 연결됐다고 표시하지 않는다. AD-B~D에서 순차적으로 대체한다.

## 로컬 검증 (2026-09-08)

- 의존성 설치 및 frozen lockfile 재설치 확인.
- lint, typecheck, production build 통과.
- 단위 테스트 88개 통과: 허용 이메일, 미인증/비허용 차단, 만료 링크, 쿠키 갱신 전달, 로그아웃 실패 시 로컬 정리, 자동 가입 차단 포함.
- 브라우저 테스트 16개 통과: 운영자 인증 3개 및 기존 입주자 회귀 13개. 실제 이메일 발송 없이 검증했다.
- 브라우저 테스트는 기존 Playwright 사용. agent-browser 실행 파일은 설치돼 있지 않았다.
- 테스트 실행기의 서버 종료 지연으로 재실행이 기존 3100 서버를 사용했다. 검증 후 이번 작업의 실행기/서버만 종료하고 production build를 다시 통과했다.
- 생성된 개발 타입 파일의 일시적 오류는 서버 정리 및 재생성 후 해결했다. 입주자 소스·루트 레이아웃 변경 없음.
- SQL 계약 테스트 파일은 작성만 했으며 실제 DB 실행·메일 로그인·운영 배포 검증은 수동 설정 후 남아 있다.

확정 작업 브랜치: feat/checkin-admin (AD-A~AD-D 공통)
제안 커밋 메시지: feat: 운영자 인증과 수동 확인 저장 기반 추가 (AD-A)

## 참고

- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/auth-smtp
