# 홈투게더 정기 체크인

카카오톡 알림톡 링크에서 열리는 입주자용 채팅형 정기 체크인 웹입니다. 개입이 필요한 생활·관계·시설·정산 문제를 조기에 감지하는 것이 목적입니다.

## 설계 문서

[운영 출시까지 남은 작업과 확정 정책](docs/remaining-work.md) — 현재 완료 상태, 다음 개발 순서, 사용자와 결정할 항목의 시작점입니다.

[테스트 환경 실행 안내](docs/test-environment.md) · [구글 시트 고객 데이터 연동](docs/guest-sheet-integration.md) · [운영자 화면 확정 설계](docs/checkin-admin-design.md)

[고객 시트 동기화 설정](docs/guest-sheet-sync.md) — 계약정보 완성 고객만 저장하는 기준, 최초 저장 결과, 하루 한 번 자동 반영을 켜기 위한 Google 인증·배포 절차.

[정기 체크인 v2 — 사용자 흐름·제품 의도·백엔드 연동 설계](docs/checkin-v2-backend-design.md)

위 문서는 백엔드 구현 전의 흐름·설계 근거입니다. 현재 연결 방법, 마이그레이션, 고객 입력 항목과 테스트 링크 발급은 [백엔드 개발·운영 준비](docs/backend-development.md)를 따릅니다.

## 현재 범위

정기 체크인 v2 프론트에 BE-A~D 백엔드를 연결했습니다. Supabase(Postgres)와 Next.js API routes로 응답·관심·진행 기록을 저장합니다.

- Next.js App Router + TypeScript + Tailwind CSS v4
- `/c/[token]` 14일 토큰과 세션별 HttpOnly 접근 쿠키
- `active/completed/expired/invalid/error` 상태 분기
- 실제 API 호출 경계: `src/domains/checkin/api`
- 카카오 인앱 웹뷰를 위한 no-store·no-referrer 헤더
- 기존 홈투게더 디자인 토큰과 `BtnCta` 재사용
- 결정론적 상태머신·답변 기록·중복 방지 제출
- 말풍선·아바타·하단 고정 컨트롤과 자동 스크롤
- 긍정 답변도 부드러운 태그 질문으로 진입 (이벤트 제외)
- 일반 이슈: 태그 → 예측 칩 → 이슈별 자유어 → 다른 불편 질문
- 긴급 이슈: 즉시 R1 → 긴급 칩 → 자유어 → 제출 (추가 이슈 질문 생략)
- 그 외 태그는 자유어 직행, 모든 자유어 화면에서 작성 건너뛰기 가능
- 최대 2개 이슈 구조화와 R1/R2 결정론적 트리아지
- 이벤트는 단일 이슈 유지, 긍정 응답도 마지막 자유어 화면 제공
- 제출 성공 후 커뮤니티 관심 카드·주제 다중선택과 독립 DB 이벤트 저장
- 로컬 나눔스퀘어 라운드 폰트와 제공된 홈투게더 로고

## 실행

```bash
pnpm install
pnpm dev:test-db
```

DB 연결 개발·테스트는 `.env.checkin-test`와 위 전용 명령을 사용합니다. [테스트 환경 안내](docs/test-environment.md)에 따라 설정하고 별도 터미널에서 `pnpm test:backend:test-db`로 가상 고객을 검증합니다. 기존 `pnpm dev`는 `.env.local`을 읽으며 현재 이 파일은 운영 지정 프로젝트에 연결돼 있으므로 테스트 용도로 혼용하지 않습니다. 실제 고객 정보는 필요하지 않습니다. 기존 `demo-*` 토큰은 브라우저 테스트에서만 사용하며 실제 API는 거부합니다.

## 검증

Playwright E2E를 처음 실행하는 환경에서는 Chromium을 한 번 설치합니다.

```bash
pnpm exec playwright install chromium
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

## 백엔드 연결 경계

`src/domains/checkin/api`는 동일 origin의 Next.js API를 호출합니다. 서버 전용 `src/server`에서 토큰·경로·본문을 검증하고 Supabase 저장 함수를 호출합니다. 아래는 월간 응답 예시입니다. 실제 sessionId는 서버가 발급한 UUID를 사용합니다.

```json
{
  "schemaVersion": 1,
  "sessionId": "session-monthly",
  "idempotencyKey": "session-monthly:monthly-guest:v1",
  "answers": {
    "responses": {
      "monthlyStatus": "issue",
      "issueTag": "facility",
      "issueDetail": "leak",
      "issueFreeText": "provided",
      "hasAnotherIssue": "no"
    },
    "issues": [
      {
        "tag": "facility",
        "detail": "leak",
        "freeText": "천장에서 물이 떨어져요.",
        "triageLevel": "R2"
      }
    ],
    "overallTriage": "R2"
  }
}
```

서버가 시나리오·회차·버전과 응답 경로를 검증하고 트리아지·결과를 재계산합니다. 세션 행 잠금과 unique 제약으로 응답을 한 번만 저장합니다. 동일 본문 재시도는 duplicate 성공, 다른 본문은 409입니다.

### v2 응답·관심 기록

- `issues[].freeText?`는 이슈별 최대 500자입니다. 두 번째 설명이 첫 번째 설명을 덮어쓰지 않습니다. 기존 `answers.freeText?`는 이슈를 먼저 선택하지 않는 이벤트의 추가 의견 등 체크인 전체 메모와의 호환성을 위해 유지합니다.
- 일반 이슈의 첫 자유어 다음에만 “더 있어요?”를 묻습니다. 두 번째 자유어 이후에는 제출합니다. `other`만 고르고 설명을 건너뛴 빈 이슈는 제출 시 제거하며, 다른 신고가 없으면 `ok`입니다. 이벤트의 명시적인 도움 요청은 건너뛰어도 신고로 유지합니다.
- `none`(해당 없음)과 `free`(그 외 직접 입력)는 별도 값입니다. v2에서는 모든 칩 선택 후 자유어 화면으로 이어집니다.
- `recordCheckinInterest`는 `submitCheckinAnswer`와 독립적이며 `CheckinAnswers`에 관심 데이터를 넣지 않습니다. 카드 노출 `exposed`, 클릭 `clicked`, 선택 완료 `topics-submitted`를 세션·이벤트 종류별로 한 번 기록합니다.
- 관심 레코드의 `clicked`, `topics`, `exposedAt`, `clickedAt`, `topicsSubmittedAt`으로 미클릭·선택 중 이탈·빈 주제 제출을 구분합니다. 최초 제출 주제를 유지합니다.
- 응답과 관심 상태는 DB에 저장되어 새로고침 후에도 유지됩니다. 진행 이벤트는 스텝 최초 도달만 기록하며 답변 본문을 포함하지 않습니다. 팝업·localStorage는 사용하지 않습니다.
- `CommunityTeaser.interestHookPercent?`는 검증된 0~100 집계값이 있을 때만 수치 제목을 사용합니다. 현재 호출부는 값을 전달하지 않으므로 확정된 공감 제목만 표시합니다. 실제 집계 연동 전에는 분모와 수치 카피를 확정해야 합니다.
- 폰트는 `public/font`의 R(400)·B(700)·EB(800)를 `next/font/local`로 로드합니다. 500은 Regular, 600은 Bold에 매칭되며 글자 크기 토큰은 유지합니다. 아바타는 `public/logos/logo_avatar_256.png`를 사용합니다.

브라우저 자동화는 Chromium에서 수행합니다. 실제 iOS·Android 카카오 인앱 웹뷰의 키보드·하단바 동작은 별도 실기기 QA가 필요합니다.

## 주요 제약

- URL에 PII를 넣지 않습니다.
- 팝업과 `window.open`을 사용하지 않습니다.
- localStorage에 응답 상태를 저장하지 않습니다.
- 본인인증·결제·회원가입을 넣지 않습니다.
- 시나리오 판단은 결정론적 규칙으로만 구현합니다.
- 시설 이벤트 DB, 집주인 2차, NPS는 이번 범위에 포함하지 않습니다.
