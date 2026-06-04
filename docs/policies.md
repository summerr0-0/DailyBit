# Team Policies

## Commit Style (Conventional Commits)

```
feat: 새 기능
fix: 버그 수정
chore: 빌드/설정 변경
docs: 문서
refactor: 리팩터
test: 테스트
```

## Branching

- `main` — production (Vercel 자동 배포)
- `feature/xxx` — 기능 브랜치
- PR: squash merge

## Daily Cycle

1. `/new-feature` → 오늘 기능 spec 작성
2. Claude 구현
3. `pnpm test:run` + `pnpm typecheck` 통과 확인
4. `git push` → Vercel preview URL 확인
5. main merge → production 배포
