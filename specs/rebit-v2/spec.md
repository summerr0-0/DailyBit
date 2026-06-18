# Spec: rebit-v2

## Meta
- **Created**: 2026-06-17
- **Type**: dev
- **Status**: implemented
- **Supersedes**: specs/rebit/spec.md (블로그 전환 후 코드베이스 변경으로 재작성)

## Goal
로그인한 사용자가 다른 사람의 Bit를 자기 피드에 리비트(Rebit)한다.
피드에 "Irin이 Rebit함" 헤더 + 원본 Bit 카드로 표시된다.

## Context
- 기존 `Rebit` DB 모델 + `RebitCard` 코드가 잔존하나 UI에서 제거됨 (tech debt)
- 현재 단일 사용자(DEV_USER)이므로 자기 Bit를 Rebit하는 케이스만 존재
- 인증 도입 시 다중 사용자로 자연스럽게 확장됨

## Non-goals
- 인용 Rebit (Quote Rebit) — 별도 스펙
- Rebit 알림
- Rebit 포인트 적립

## Requirements

### R1: Rebit 토글
- 로그인 시: BitCard 하단에 Rebit 버튼(카운트 포함) 표시
- 클릭 → POST /api/bits/:id/rebit → 피드에 Rebit 카드 추가
- 이미 Rebit한 경우 → DELETE /api/bits/:id/rebit → 피드에서 제거
- 비로그인 시: Rebit 버튼 비표시

### R2: 피드 표시
- 홈 피드에서 Rebit 항목은 원본 BitCard 위에 "Irin이 Rebit함" 배너 표시
- Rebit 항목은 createdAt(rebit 시각) 기준 정렬

### R3: DB
- 기존 `Rebit` 모델 활용 (`userId`, `bitId`, `@@unique`) — 이미 존재
- `getBitsFiltered()` 확장: Rebit 목록 포함하여 피드 반환

## Tasks

### T1: 기존 Rebit 코드 정리 + API 구현 [backend]
- `src/lib/bits.ts` — `toggleRebit(bitId, userId)` 구현
- `src/app/api/bits/[id]/rebit/route.ts` — POST (rebit), DELETE (un-rebit)
- `getBitsFiltered()` — Rebit 항목 병합 후 시간순 정렬

### T2: UI [frontend]
- `src/components/bits/RebitButton.tsx` — `"use client"`, 토글 버튼
- `src/components/bits/RebitCard.tsx` — "Irin이 Rebit함" 배너 + 원본 BitCard
- `BitList` — FeedItem이 Bit | Rebit 유니온 타입 처리

### T3: 테스트
- Rebit 토글 API 검증
- Rebit 카드 렌더 검증
