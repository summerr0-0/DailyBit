# Garden 깊이 기반 개선 — Worklog

## 목표

잔디밭을 소셜 활동 지표(Rebit 포함 단순 카운트)에서 탐구 깊이 시각화 도구로 전환.
날짜 클릭 시 그날의 탐구 기록을 패널로 펼쳐 보여준다.

## 구현 범위

### lib/garden.ts 변경
- `getGarden()`: Rebit 제거, Thread Bit = 2pt / 독립 메모 = 1pt 가중 점수 집계
- `getBitsByDateKST(dateKey)` 신규: KST 날짜 범위 → UTC로 변환해 해당일 Bit 쿼리
- `activityLevel()`, `buildGardenGrid()` 로직 유지 (점수 의미만 변경, 테스트 영향 없음)

### src/app/api/bits/by-date/route.ts (신규)
- `GET /api/bits/by-date?date=yyyy-mm-dd` — 날짜 유효성 검사 후 getBitsByDateKST 호출

### GardenGrid.tsx → Client Component 전환
- `"use client"` 추가
- `selectedDate` 상태 + 날짜 셀 클릭 핸들러
- 선택된 날짜 → `/api/bits/by-date` fetch → `DayPanel` 컴포넌트 렌더
- DayPanel: Thread 배지, AI 협업 배지, 본문 2줄 요약
- 재클릭 시 패널 닫힘

### garden/page.tsx
- "개수" → "점수" 표기 변경 (2pt/1pt 범례 추가)

## 기술 결정

- 잔디 색상 임계값(activityLevel) 유지: 기존 테스트 통과를 위해 임계 공식 불변
  - 대신 점수 단위가 변경되어 실질적으로 더 오래 지속해야 높은 레벨 달성
- KST 날짜 → UTC 변환: `new Date(dateKey + 'T00:00:00Z').getTime() - KST_OFFSET_MS`
- GardenGrid 셀을 `<div>` → `<button>`으로 변경 (접근성 개선)
- `Link` import: 클라이언트 컴포넌트에서 정상 사용 가능

## 검증 결과

- `pnpm typecheck`: 오류 없음
- `pnpm test:run`: 55개 전부 통과 (activityLevel 테스트 유지 확인)
- `GET /api/bits/by-date?date=2026-06-14` → 해당일 Bit 반환 확인
