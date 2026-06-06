# /new-feature

오늘의 기능 빌드 사이클을 시작합니다.

## Protocol

1. 사용자에게 오늘 만들 기능을 한 줄로 설명하게 한다
2. `/specify`로 `specs/YYYY-MM-DD-[feature].md` 생성
3. 스펙 승인 후 feature 브랜치 생성
4. 구현 시작
5. `pnpm test:run && pnpm typecheck` 통과 확인
6. 커밋 후 PR 생성 (`gh pr create`)
7. GitHub Actions CI 통과 확인
8. PR 머지 → Vercel 자동 배포

## Daily Cycle

```
기능 설명
    ↓
specs/ 파일 생성 (기획)
    ↓
[사람] 스펙 승인
    ↓
git checkout -b feature/[feature-name]
    ↓
Claude 구현
    ↓
pnpm test:run + pnpm test:e2e (검증)
    ↓
git commit + git push origin feature/[feature-name]
    ↓
gh pr create (PR 생성)
    ↓
[사람] PR 머지
    ↓
Vercel 자동 배포
```

## 브랜치 네이밍

`feature/[기능명]` — 예: `feature/bit-write-form`, `feature/auth-login`
