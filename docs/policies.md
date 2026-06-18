# Policies

## Commit Style (Conventional Commits)

```
feat: 새 기능
fix: 버그 수정
chore: 빌드/설정 변경
docs: 문서
refactor: 리팩터
test: 테스트
```

## Branching & PR 흐름

```
feature/[기능명]
    ↓ git push
PR 생성 (gh pr create) — 직전에 /gemini-review 필수
    ↓ GitHub Actions CI 통과
PR 머지 → main
    ↓
Vercel 자동 배포
```

- `main` — production (Vercel 자동 배포, 직접 push 금지)
- `feature/xxx` — 기능 브랜치 (PR로만 머지)
- PR 전 `specs/<feature>/worklog.md` 작성 필수
- PR: squash merge, 기능 단위 1개

## 작업 흐름

```
/new-feature
    ↓
[Claude] specs/ 기획 문서 생성
    ↓
[사람] 스펙 승인
    ↓
[Claude] feature 브랜치 생성 + 구현 + 테스트
    ↓
[Claude] /gemini-review → worklog 작성 → gh pr create
    ↓
[사람] PR 머지
    ↓
[자동] Vercel 배포
```
