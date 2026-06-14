# Pin 기능 — Worklog

## 목표

소셜 좋아요 대신, 내가 나중에 다시 봐야 할 중요한 기록을 상단에 고정.
메인 피드에서 핀 고정 항목이 최상단에 표시된다.

## 구현 범위

- schema: Bit.pinned Boolean @default(false) 추가
- lib/bits.ts: BitWithAuthor에 pinned 추가, BIT_SELECT에 포함, getBits/getBitsFiltered 정렬에 pinned DESC 우선, toggleBitPin() 신규
- PATCH /api/bits/[id]: toggleBitPin 호출
- BitActionsMenu: pinned? prop, "핀 고정"/"핀 해제" 메뉴 항목
- BitCard: pinned일 때 "핀" 텍스트 배지 표시
- BitList: pinned prop 전달
- feed.ts, garden.ts: pinned 필드 동기화
- 테스트 픽스처 pinned: false 추가

## 검증

- typecheck: 오류 없음
- test:run: 55개 전부 통과
