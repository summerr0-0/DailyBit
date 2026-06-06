# Spec: bit-actions-menu

## Meta
- **Created**: 2026-06-06
- **Type**: dev
- **Status**: approved
- **Approved by**: user
- **Approved at**: 2026-06-06
- **Note**: delete-bit(#11)의 호버 전용 삭제 버튼이 모바일/터치에서 발견 불가 → 트위터식 `⋯` 메뉴로 교체. 기존 DELETE API·흐름 재사용. Gemini 교차리뷰로 초기 커스텀 드롭다운 → `@base-ui/react` Menu 전환(접근성 표준 처리).

## Goal
각 Bit 카드 우상단에 항상 보이는 `⋯` 메뉴를 두고, 열면 "삭제"를 선택할 수 있게 한다. 오늘 배포 가능한 수준.

## Non-goals
- Bit 수정(edit) — 별도 기능
- 공유/신고 등 다른 메뉴 항목 — 지금은 삭제만
- 소유자/권한 검증 — NextAuth 도입 후 (현재 전부 DEV_USER)
- 새 의존성 추가 — 이미 설치된 `@base-ui/react`·`lucide-react` 활용 (radix 등 신규 도입 없음)

## Confirmed Goal
호버 전용 `DeleteBitButton`을 폐지하고, 항상 노출되는 `⋯` 트리거 + 드롭다운 메뉴(`BitActionsMenu`)로 교체한다. 메뉴의 "삭제"는 기존 `DELETE /api/bits/[id]` 흐름(confirm → fetch → refresh)을 그대로 사용한다.

- **포함**: `⋯` 트리거(항상 노출), 드롭다운(삭제 항목), 바깥클릭·Esc 닫기, a11y 속성, 삭제 흐름 이전
- **완료 기준**: 데스크톱·모바일 모두 `⋯` 보임 → 탭 → 삭제 → confirm → 목록에서 사라짐, 배포 완료

## Research

### 재사용 자산
- 삭제 백엔드 일체 존재: `DELETE /api/bits/[id]`(`src/app/api/bits/[id]/route.ts`), `deleteBit`(`src/lib/bits.ts`) → 변경 불필요
- `DeleteBitButton`의 confirm→fetch→`router.refresh()`/실패 처리 로직 → 메뉴 항목으로 이전
- `BitList`(`getFeed()` → `items[].bit.id`)에서 카드 래퍼에 액션 부착 (`src/components/bits/BitList.tsx`)
- `RebitButton`이 클라이언트 액션 컴포넌트 패턴 선례

### 기술 포인트
- `@base-ui/react`(^1.5.0)·`lucide-react`(^1.17.0) 이미 설치됨 → 새 의존성 없이 활용
- base-ui Menu가 포커스 관리/키보드 내비/portal/바깥클릭/Esc를 표준 처리
- 홈 헤더가 sticky `z-10` → `Menu.Positioner`에 `z-20`
- base-ui 위치계산(floating-ui)이 ResizeObserver 필요 → jsdom에 폴리필(`src/test/setup.ts`)

### 제약
- Server Component first — 상태·이벤트 필요하므로 `"use client"` (`.claude/rules/server-component-first.md`)
- `src/components/ui/` 미수정(shadcn 생성물)
- App Router only, Prisma 스키마 변경 없음

## Decisions

### D1: 메뉴 구현 = `@base-ui/react` Menu (이미 설치됨)
- **Status**: resolved (Gemini 리뷰로 커스텀 → base-ui 전환)
- **선택**: `@base-ui/react/menu`의 `Menu.Root/Trigger/Portal/Positioner/Popup/Item`.
- **Rationale**: base-ui는 프로젝트에 이미 설치된 shadcn v4 프리미티브(새 의존성 0). 포커스 관리·키보드 내비·portal·바깥클릭·Esc를 표준 처리 → 커스텀 자체구현의 접근성 결함(포커스 미이동, `aria-controls` 누락, Tab 시 메뉴 잔존)을 회피.

### D2: `⋯` 항상 노출 (호버 전용 폐지)
- **Status**: resolved
- **선택**: 카드 우상단에 `⋯` 상시 표시. 기존 `opacity-0 group-hover:opacity-100` 제거.
- **Rationale**: delete-bit의 핵심 문제(터치/모바일에서 hover 없어 발견 불가) 해결. 트위터 UX와 일관.

### D3: 삭제 흐름 = 기존 API 재사용, `DeleteBitButton` 폐지·흡수
- **Status**: resolved
- **선택**: confirm→`fetch(DELETE)`→`router.refresh()`/실패 alert 로직을 `BitActionsMenu`로 이전. `DeleteBitButton.tsx`/테스트 삭제.
- **Rationale**: 백엔드 무변경 재사용. 호버 버튼이 메뉴로 대체되므로 구컴포넌트는 dead code → 제거.

### D4: 접근성 = aria + 키보드/바깥클릭 닫기
- **Status**: resolved
- **선택**: 트리거 `aria-haspopup="menu"`·`aria-expanded`·`aria-label="Bit 메뉴"`, 메뉴 `role="menu"`, 항목 `role="menuitem"`. Esc·바깥클릭으로 닫힘.
- **Rationale**: 항상 노출 메뉴의 기본 접근성 보장.

### D5: 아이콘 = `lucide-react` `MoreHorizontal`
- **Status**: resolved (Gemini 리뷰 반영)
- **선택**: 이미 설치된 `lucide-react`의 `MoreHorizontal`.
- **Rationale**: 프로젝트 표준 아이콘 라이브러리와 일관, 유지보수 용이.

## Constraints
- Prisma 스키마/API 변경 없음 (삭제 백엔드 재사용)
- `BitCard.tsx` 미수정 (액션은 `BitList` 래퍼에 부착, 카드 본문 비침습)
- `"use client"`는 `BitActionsMenu`에 한정
- `main` 직접 push 금지 → `feature/bit-actions-menu` 브랜치 + PR

## Known Gaps
- 권한 검증 없음(인증 후 후속) — id만 알면 삭제 가능
- 태그 페이지(`/tags/[tag]`)는 여전히 삭제 메뉴 없음 (홈 피드 한정, 범위 밖)
- 메뉴 항목 단일("삭제") — 수정/공유 등은 추후

## Requirements

### R0: ⋯ 메뉴로 삭제 (goal-level)

#### R0.1: 항상 보이는 ⋯ → 삭제
- **Given**: 홈 피드에 Bit가 보임 (호버 없이도)
- **When**: `⋯` 클릭 → "삭제" 클릭 → confirm 수락
- **Then**: 해당 Bit 삭제, 목록 새로고침으로 사라짐

### R1: 트리거·메뉴 토글 (D1·D2·D4, UI 경계)

#### R1.1: ⋯ 상시 노출
- **Given**: 카드 렌더 (호버 안 함)
- **When**: 화면 확인
- **Then**: 우상단에 `⋯` 트리거 보임 (opacity 호버 의존 없음)

#### R1.2: 클릭 시 메뉴 토글
- **Given**: 메뉴 닫힘
- **When**: `⋯` 클릭
- **Then**: 메뉴 열림(삭제 항목 표시), `aria-expanded=true`

#### R1.3: 바깥 클릭/Esc로 닫힘
- **Given**: 메뉴 열림
- **When**: 메뉴 밖 클릭 또는 Esc
- **Then**: 메뉴 닫힘

### R2: 삭제 항목 (D3, UI 경계)

#### R2.1: confirm 수락 시 삭제 요청 + 새로고침
- **Given**: 메뉴 열림
- **When**: "삭제" 클릭 → confirm 수락
- **Then**: `/api/bits/<id>` DELETE 호출, 성공 시 `router.refresh()`

#### R2.2: confirm 취소 시 무동작
- **Given**: 메뉴 열림
- **When**: "삭제" 클릭 → confirm 취소
- **Then**: 요청·새로고침 없음

#### R2.3: 실패 시 재시도 가능
- **Given**: DELETE 실패(ok=false)
- **When**: 삭제 시도
- **Then**: 새로고침 안 함, 안내 후 다시 시도 가능

### R3: 피드 통합 (UI 경계)

#### R3.1: 카드마다 메뉴, 기존 표시 회귀 없음
- **Given**: 홈 피드 목록(`BitList`)
- **When**: 렌더
- **Then**: 각 카드에 `⋯` 메뉴, 본문·작성자·Rebit 영역 회귀 없음. `DeleteBitButton` 미사용.

**Coverage**: D1/D2/D4→R1, D3→R2, D2/D3→R3. 경계: 토글(R1) ↔ 삭제 액션(R2) ↔ 부착(R3).

## Tasks

### T1: `BitActionsMenu` 컴포넌트 [UI]
- **Fulfills**: R1, R2
- **Depends on**: (none)
- 내용: `src/components/bits/BitActionsMenu.tsx`(`"use client"`). `@base-ui/react` Menu + lucide `MoreHorizontal` 트리거(`aria-label`), 드롭다운(role=menu) + "삭제"(role=menuitem). 포커스/키보드/바깥클릭/Esc는 base-ui 처리. 삭제는 `DeleteBitButton` 로직 이전(confirm→DELETE→refresh/실패). 테스트는 `userEvent` 기반 코로케이트 + ResizeObserver 폴리필.

### T2: `BitList` 통합 + 구버튼 제거 [UI]
- **Fulfills**: R0, R3.1
- **Depends on**: T1
- 내용: `BitList`에서 호버 래퍼를 상시 노출 `⋯`로 교체, `DeleteBitButton` → `BitActionsMenu`. `DeleteBitButton.tsx`/`DeleteBitButton.test.tsx` 삭제.

**Coverage**: R0→T2, R1/R2→T1, R3.1→T2.
DAG: `T1 → T2`.

## External Dependencies

### Pre-work
- 신규 의존성 없음 (커스텀 드롭다운, 인라인 SVG)
- API/스키마 변경 없음

### Post-work
- `feature/bit-actions-menu` 브랜치 → push → `gh pr create`
- 구현·테스트 통과 후 PR 직전 `/gemini-review` 교차검증
- PR 머지 → Vercel 자동 배포 → 모바일·데스크톱 `⋯` 스모크 확인
