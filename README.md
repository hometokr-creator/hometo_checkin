# 홈투게더 정기 체크인

카카오톡 알림톡 링크에서 열리는 입주자용 채팅형 정기 체크인 웹입니다. 개입이 필요한 생활·관계·시설·정산 문제를 조기에 감지하는 것이 목적입니다.

## 설계 문서

[정기 체크인 v2 — 사용자 흐름·제품 의도·백엔드 연동 설계](docs/checkin-v2-backend-design.md)

현재 시나리오, 질문별 의도, 실제 payload, 권장 데이터 구조·API·인증·중복 제출 처리, 운영 지표와 연동 결정 사항을 정리했습니다. 현재 구현과 백엔드 제안을 구분합니다.

## 현재 범위

PR A~D 위에 정기 체크인 v2 변경을 반영했습니다. 데이터 저장은 여전히 목 구현입니다.

- Next.js App Router + TypeScript + Tailwind CSS v4
- `/c/[token]` 일회성 토큰 라우트와 목 세션 해석
- `active/completed/expired/invalid/error` 상태 분기
- 실제 API 교체 경계: `src/domains/checkin/api`
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
- 제출 성공 후 커뮤니티 관심 카드·주제 다중선택과 독립 목 이벤트 저장
- 로컬 나눔스퀘어 라운드 폰트와 제공된 홈투게더 로고

## 실행

```bash
pnpm install
pnpm dev
```

정상 월간 목 세션은 `http://localhost:3000/c/demo-monthly`에서 확인할 수 있습니다.

## 목 토큰

| 주소 | 상태 |
| --- | --- |
| `/c/demo-monthly` | 월간 정상 세션 |
| `/c/demo-onboarding` | 온보딩 D+7 |
| `/c/demo-monthly-first` | 첫 월간 |
| `/c/demo-renewal` | 재계약 회차 |
| `/c/demo-event-facility` | 시설 이벤트 |
| `/c/demo-event-rule` | 규칙 이벤트 |
| `/c/demo-completed` | 이미 응답함 |
| `/c/demo-expired` | 만료 |
| `/c/demo-invalid` | 무효 |
| `/c/demo-error` | 오류 |

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

현재 DB와 전송 방식은 미정이며 `src/domains/checkin/api`만 목 구현입니다. UI는 완료 시 아래 구조의 `schemaVersion: 1` payload를 한 번 제출합니다.

```json
{
  "schemaVersion": 1,
  "sessionId": "session-monthly",
  "idempotencyKey": "session-monthly:monthly-guest:v1",
  "answers": {
    "responses": { "monthlyStatus": "issue" },
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

실제 API를 붙일 때는 서버가 토큰과 세션의 관계, 중복 제출, payload 버전을 검증해야 합니다. DB 테이블 구조와 토큰 전달 방식은 백엔드 확정 후 이 계약을 기준으로 결정합니다.

### v2 응답·관심 기록

- `issues[].freeText?`는 이슈별 최대 500자입니다. 두 번째 설명이 첫 번째 설명을 덮어쓰지 않습니다. 기존 `answers.freeText?`는 이슈를 먼저 선택하지 않는 이벤트의 추가 의견 등 체크인 전체 메모와의 호환성을 위해 유지합니다.
- 일반 이슈의 첫 자유어 다음에만 “더 있어요?”를 묻습니다. 두 번째 자유어 이후에는 제출합니다. `other`만 고르고 설명을 건너뛴 빈 이슈는 제출 시 제거하며, 다른 신고가 없으면 `ok`입니다. 이벤트의 명시적인 도움 요청은 건너뛰어도 신고로 유지합니다.
- `none`(해당 없음)과 `free`(그 외 직접 입력)는 별도 값입니다. v2에서는 모든 칩 선택 후 자유어 화면으로 이어집니다.
- `recordCheckinInterest`는 `submitCheckinAnswer`와 독립적이며 `CheckinAnswers`에 관심 데이터를 넣지 않습니다. 카드 노출 `exposed`, 클릭 `clicked`, 선택 완료 `topics-submitted`를 세션·이벤트 종류별로 한 번 기록합니다.
- 목 관심 레코드의 `clicked`, `topics`, `exposedAt`, `clickedAt`, `topicsSubmittedAt`으로 미클릭·선택 중 이탈·빈 주제 제출을 구분합니다. 콘솔의 `[mock:checkin-interest]`에서 확인할 수 있습니다.
- 목 저장은 현재 JavaScript 런타임의 메모리에 한정됩니다. 새로고침·다른 기기 사이의 중복 방지 및 다음 회차 재참여 분석은 백엔드에서 세션을 입주자와 연결해야 합니다. 팝업·localStorage는 사용하지 않습니다.
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
