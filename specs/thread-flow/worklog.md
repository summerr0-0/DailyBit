# Thread Flow (탐구 줄기) — Worklog

## 목표

DailyBit을 개인 포트폴리오 블로그로 전환하는 첫 단계.
단발성 Bit 작성 대신 "탐구 줄기(Thread)" 단위로 문제 해결 과정을 시계열로 엮는 기능 구현.

## 구현 범위

### Schema 변경 (prisma/schema.prisma)
- `AiCollab` enum 추가: `NONE | HINT | LED`
- `Thread` 모델 추가: `id, title, authorId, createdAt, updatedAt, bits[]`
- `Bit` 모델 변경: `threadId?` (Thread FK), `aiCollab: AiCollab` 필드 추가
- `User` 모델: `threads Thread[]` 관계 추가

### API
- `GET /api/threads` — 내 탐구 줄기 목록 (bitCount 포함)
- `POST /api/threads` — 새 줄기 생성 (title 1~100자)
- `POST /api/bits` — threadId?, aiCollab? 파라미터 추가

### Lib
- `src/lib/threads.ts` 신규: `getThreads`, `createThread`, `getThread`
- `src/lib/bits.ts` 업데이트: `BitWithAuthor` 타입에 `aiCollab`, `thread` 추가, `BIT_SELECT` 공통 상수 추출

### UI
- `BitComposer.tsx` 재작성: 모드 토글(독립/이어쓰기), 줄기 드롭다운, 새 줄기 인라인 생성, AI 협업 강도 선택
- `BitCard.tsx` 업데이트: 탐구 줄기 배지(링크), AI 협업 수준 배지 표시
- `src/app/threads/[id]/page.tsx` 신규: 단계별 타임라인 뷰 (번호 + 세로선 + AI 힌트 배지)

### 연쇄 수정
- `src/lib/feed.ts`: `BitForFeed` 타입 및 쿼리에 `aiCollab`, `thread` 추가
- `src/components/bits/BitCard.test.tsx`: fixture에 `aiCollab: "NONE"`, `thread: null` 추가

## 기술 결정

- DB: `prisma db push` 사용 (마이그레이션 히스토리 드리프트 상태였으므로)
- Thread 삭제 시 Bit의 threadId는 `onDelete: SetNull` (Bit 자체는 유지, 독립 메모로 전환)
- AiCollab 기본값 `NONE` — 명시하지 않으면 표시 안 함
- Thread 페이지는 Server Component, BitComposer는 Client Component 유지

## 검증 결과

- `pnpm typecheck`: 오류 없음
- `pnpm test:run`: 55개 테스트 전부 통과
- `GET /api/threads` → 200, `POST /api/threads` → 201
- `POST /api/bits` with threadId + aiCollab: HINT → 응답에 thread 객체 포함 확인
- `/threads/[id]` → 200, 단계 타임라인 렌더 확인

---

## Interactive Features + Security Hardening + Private Content (follow-up sessions)

### Interactive features
- Warm orange theme throughout (replaced purple)
- Login page + passphrase auth (httpOnly cookie, 30-day session)
- Anonymous comments: per-comment deletion password (bcrypt), 60s spam cooldown
- Like toggle with cookie-based dedup (likeId in browser cookie, DELETE to unlike)
- Rebit with optional message (orange bubble)
- Thread reply button (Twitter-style modal, auto-creates Thread on first reply)
- ProfileCard: avatar, resume PDF, GitHub/LinkedIn/Email links
- Tags sidebar (full tagCloud) on thread detail, /threads, /tags/[tag]

### Security hardening
- Removed hardcoded passphrase fallback from login route (503 if ADMIN_PASSPHRASE unset)
- Login rate limiting: 5 attempts/IP per 15 min → 429
- Comment deletion passwords upgraded to bcrypt (cost 10)
- Auth cookie sameSite: lax → strict
- Security headers via next.config.ts

### Private content
- `Bit.private` field: toggle in BitComposer and BitActionsMenu
- `PrivateTag` model: tag-level privacy managed from TagSidebar lock icon (optimistic UI)
- Private tag pages return 404 to unauthenticated visitors

### Test results
- 8 test files, 52 tests — all passing

---

## UI English Localization (follow-up)

Portfolio targets English-speaking interviewers; localized all user-facing Korean strings to English.

### Files updated

- `src/app/layout.tsx` — metadata description
- `src/app/page.tsx` — Suspense fallback strings
- `src/app/garden/page.tsx` — back link "← Home", score labels ("pts"), depth legend
- `src/app/threads/[id]/page.tsx` — back link, "{n} steps", AI badges, date locale en-CA, empty state
- `src/app/tags/[tag]/page.tsx` — back link, empty state
- `src/components/bits/BitComposer.tsx` — mode buttons, thread dropdown, placeholders, AI collab label, submit/error messages
- `src/components/bits/BitCard.tsx` — "AI: Hint"/"AI: Led" badges, "Pin" badge
- `src/components/bits/BitActionsMenu.tsx` — Pin/Unpin/Delete menu items, confirm/alert dialogs
- `src/components/bits/BitList.tsx` — empty state messages
- `src/components/bits/TagFilterBar.tsx` — "Skill Tags" header, "Clear filter" button
- `docs/backlog.md` — removed SNS items (Like, Follow, Notifications, Mention, Bookmark, Quote Rebit)

---

## CI Fix (post-merge)

After #18 merged, CI was failing on `feature/thread-flow` with lint errors and stale e2e tests.

### Root causes
- `src/app/page.tsx`: `<a href="/">` violated `@next/next/no-html-link-for-pages` ESLint rule
- `src/components/bits/BitComposer.tsx`: unused `tags` variable and `parseTags` import
- `src/components/profile/ProfileCard.tsx`: unused `Link` import
- `e2e/feed.spec.ts`: three tests stale after portfolio UI redesign:
  - "DailyBit" heading check → UI uses span, not heading element
  - "devuser" author check → author no longer shown in BitCard
  - `getByText("#dailybit", { exact: true })` → strict mode violation (2 elements matched)

### Fixes
- Replaced `<a>` with `<Link>` and added `next/link` import in `page.tsx`
- Removed unused vars/imports in `BitComposer` and `ProfileCard`
- Updated e2e: heading→"one small bit a day" tagline, devuser→"Irin Jeong" (ProfileCard), #dailybit→`getByRole("link").first()`
