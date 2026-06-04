# /new-feature

오늘의 기능 빌드 사이클을 시작합니다.

## Protocol

1. 사용자에게 오늘 만들 기능을 한 줄로 설명하게 한다
2. `/specify`로 `specs/YYYY-MM-DD-[feature].md` 생성
3. spec 승인 후 구현 시작
4. `pnpm test:run && pnpm typecheck` 통과 확인
5. `git push origin feature/[feature-name]`
6. Vercel preview URL 확인

## Daily Cycle

```
기능 설명 → spec → 구현 → 테스트 통과 → push → preview 확인
```
