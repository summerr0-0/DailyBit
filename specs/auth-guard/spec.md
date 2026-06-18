# Spec: auth-guard

## Meta
- **Created**: 2026-06-17
- **Type**: dev
- **Status**: implemented

## Goal
Irin(싱글 오너)만 로그인해서 Bit 작성·삭제·Thread 생성·Rebit 가능.
방문자는 로그인 없이 피드 읽기·좋아요·댓글 가능.

## Context
- 현재 인증: `POST /api/auth/login` passphrase → httpOnly 쿠키 `db_auth=1` (30일)
- DEV_USER(`dev@dailybit.dev`) 고정. 로그인 = Irin 본인.
- `specs/auth-github/` GitHub OAuth는 장기 계획. 이 스펙은 passphrase 쿠키를 그대로 활용.

## Non-goals
- 다중 사용자 / 회원가입
- GitHub OAuth 교체 (별도)
- 역할(role) 시스템

## Requirements

### R1: API 레벨 인증 가드 (쓰기만)
쿠키 `db_auth=1` 없으면 401:
- `POST /api/bits`
- `DELETE /api/bits/:id`
- `PATCH /api/bits/:id` (pin)
- `POST /api/threads`
- `DELETE /api/threads/:id`
- `POST /api/bits/:id/rebit` (Rebit — 별도 스펙에서 구현)
- `DELETE /api/comments/:id` (댓글 삭제)

인증 불필요 (공개):
- 모든 GET 엔드포인트
- `POST /api/bits/:id/like`
- `POST /api/bits/:id/comments`

### R2: UI 레벨 가드
- 홈 페이지: 비로그인 시 BitComposer 숨김 → "로그인하여 기록을 남기세요 →" 안내 + `/login` 링크
- BitActionsMenu (삭제·핀): 비로그인 시 렌더링 안 함

### R3: 인증 헬퍼
- `src/lib/auth.ts`
  - `isLoggedIn(): Promise<boolean>` — Server Component용 (`cookies()` 읽기)
  - `requireAuth(request: Request): Response | null` — API 라우트용 (null이면 통과, Response면 즉시 리턴)

## Tasks

### T1: auth 헬퍼 [infra]
- `src/lib/auth.ts` 신규 생성

### T2: API 가드 [backend]
- `src/app/api/bits/route.ts` (POST)
- `src/app/api/bits/[id]/route.ts` (DELETE, PATCH)
- `src/app/api/threads/route.ts` (POST)
- `src/app/api/threads/[id]/route.ts` (DELETE)

### T3: UI 가드 [frontend]
- `src/app/page.tsx` — `isLoggedIn()` prop 전달
- `src/components/bits/BitList.tsx` — `isLoggedIn` prop → BitActionsMenu 조건 렌더
- 로그인 유도 블록 컴포넌트

### T4: 테스트
- 쿠키 없이 POST/DELETE → 401
- 쿠키 있으면 정상 처리
