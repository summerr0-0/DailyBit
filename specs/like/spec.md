# Spec: like

## Meta
- **Created**: 2026-06-08
- **Updated**: 2026-06-17
- **Type**: dev
- **Status**: implemented

## Goal
방문자(로그인 불필요)가 Bit에 좋아요를 누를 수 있다. 하트 토글 버튼과 카운트 표시.

## Non-goals
- 로그인/계정 연동
- 좋아요 취소 (누른 사람 추적 없음 — 단순 카운터)
- BitPoint 연동
- 알림 연동

## Model
- `Like` 모델: `userId` 없음. `{ id, bitId, createdAt }` — 익명 카운터
- 중복 방지: 쿠키 기반 (`liked_<bitId>=1`, 30일). 서버 검증 없이 클라이언트에서 버튼 상태만 관리.
- 좋아요 취소: 지원하지 않음 (단순 +1, 한 번만)

## Requirements

### R1: 좋아요 버튼
- 모든 방문자에게 하트 버튼 + 카운트 표시
- 클릭 → `POST /api/bits/:id/like` → 카운트 +1
- 이미 누른 경우(쿠키 기준) → 버튼 비활성화(filled heart), 클릭 불가
- 서버는 단순 카운트만 올림 (중복 방지 책임은 클라이언트 쿠키)

### R2: 카운트 표시
- BitCard에 하트 아이콘 + 숫자
- 0일 때는 숫자 숨김 (아이콘만)

## Tasks

### T1: DB + API [backend]
- `prisma/schema.prisma` — `Like { id String @id @default(cuid()), bitId String, createdAt DateTime @default(now()) }` + `Bit` relation
- `pnpm db:migrate`
- `src/lib/likes.ts` — `addLike(bitId): Promise<number>` (count 반환), `getLikeCount(bitId)`
- `src/app/api/bits/[id]/like/route.ts` — POST only (인증 불필요)
- `getBitsFiltered()` — `_count.likes` 포함

### T2: UI [frontend]
- `src/components/bits/LikeButton.tsx` — `"use client"`, 쿠키 확인 후 토글 표시
- `BitCard` — LikeButton 통합, 카운트 표시

### T3: 테스트
- POST /api/bits/:id/like → count +1 검증
- LikeButton 렌더: 쿠키 없을 때 활성, 있을 때 비활성
