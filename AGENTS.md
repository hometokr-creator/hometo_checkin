# 저장소 작업 규칙

## 브랜치와 커밋 (2026-09-08 사용자 확정)

- 정기 체크인 운영자 화면 AD-A~AD-D 작업은 **`feat/checkin-admin` 브랜치 하나에서 진행**한다. 단계별로 새 브랜치를 만들지 않는다.
- 작업 시작 전과 파일 변경·커밋 직전에 `git branch --show-current`와 `git status --short`로 현재 브랜치와 변경사항을 확인한다.
- **`main`에서는 파일을 생성·수정·삭제하거나 커밋하지 않는다.** 읽기 전용 확인만 허용한다. 파일을 생성하거나 바꿀 수 있는 설치·빌드·테스트·코드 생성 명령도 작업 브랜치에서 실행한다.
- 현재 브랜치가 `main`이면 파일 변경 전에 작업 브랜치를 생성하거나 적절한 기존 작업 브랜치로 전환한다. 브랜치 생성·전환은 작업 수행 범위 안에서 허용한다. 기존 변경사항은 먼저 확인하고 손실 없이 보존한다.
- **`main`이 아닌 작업 브랜치에서는 파일 변경과 커밋까지 허용한다.** 요청받은 작업 범위의 변경만 검토하고 필요한 검증을 거쳐 커밋하며, 사용자의 무관한 변경을 섞지 않는다. 커밋을 위해 매번 재확인할 필요는 없다.
- 이전 작업 프롬프트의 일괄적인 Git 조작·커밋 금지 지침은 위 사용자 결정으로 대체한다.
- 푸시·PR 생성·병합·배포는 위 커밋 허용에 포함되지 않는다. 별도의 사용자 요청이나 기존 명시적 승인이 있을 때만 수행한다.
- detached HEAD 상태에서도 파일 변경·커밋 전에 작업 브랜치를 만든다. 브랜치 전환이 실패하면 현재 브랜치에서 수정을 강행하지 않는다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
