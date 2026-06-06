# Spec: garden

## Meta
- **Created**: 2026-06-06
- **Type**: dev
- **Status**: approved
- **Approved by**: user
- **Approved at**: 2026-06-06

## Goal
GitHub contribution 그래프처럼 지난 1년간의 일별 활동(Bit + Rebit)을 잔디 그리드로 시각화하고, 오늘 얼마나 했는지를 보여준다.

## Non-goals
- BitPoint 점수 시스템 전체 구현 (가중치 적립 로직)
- 댓글 집계 (댓글 기능 미구현)
- 다중 유저 잔디 (로그인 도입 후)
- 활동 상세 드릴다운(특정 날 클릭 시 그 날 Bit 목록 등) — 이번 범위 밖
- 연속 기록(streak)·뱃지 등 게이미피케이션

## Confirmed Goal
지난 1년간 Bit·Rebit를 일별로 집계해 GitHub 스타일 주×요일 그리드(칸별 0~4 강도 색)로 렌더하고, 오늘 활동 수를 강조 표시한다. 단일 dev 유저 기준이며, 기존 `createdAt` 집계만 사용해 스키마 변경 없이 구현한다.

- **완료 기준**: 잔디 그리드에서 활동 많은 날이 진하게 표시, 오늘 활동 수 표시, 활동 없는 날은 빈 칸
- **현 제약**: 인증 전이라 dev 유저의 전체 활동을 집계 (로그인 시 유저별로 확장)

## Research
- 활동 원천: `Bit.createdAt`, `Rebit.createdAt` (`prisma/schema.prisma`) — 둘 다 `DateTime @default(now())`, 스키마 변경 없이 집계 가능
- 데이터 접근: Prisma는 날짜 단위 group by가 까다로워, 지난 1년 `createdAt`만 select해 JS로 일별 집계하는 방식이 단순 (`src/lib/` 신규 함수)
- 기존 서비스 패턴: `getFeed`/`getBits`가 `prisma.bit.findMany` + 매핑 (`src/lib/bits.ts`, `src/lib/feed.ts`) → 동일 패턴으로 `getGarden()` 추가
- 주체: `ensureDevUser`/`DEV_USER`로 dev 유저 확보 (`src/lib/bits.ts`) — 집계는 읽기라 `findUnique`로 충분
- 라우팅: App Router. 홈은 `src/app/page.tsx`(force-dynamic), 태그 페이지 `src/app/tags/[tag]/page.tsx` 패턴 → `/garden` 또는 홈 상단에 배치
- 시간대 주의: `createdAt`는 UTC. "오늘"·일자 경계는 KST(+9) 기준으로 변환해야 자정 경계가 맞음
- 렌더: RSC로 그리드 SSR 가능(상호작용 불필요) — `.claude/rules/server-component-first.md`
- 제약: App Router only, Prisma는 `@/lib/prisma`에서만, pnpm

## Decisions

### D1: 별도 `/garden` 페이지 (RSC, force-dynamic)
- **Status**: resolved
- **Rationale**: `src/app/garden/page.tsx`에 1년 그리드 전용 페이지. 홈 상단(대안)은 53주 그리드가 모바일에서 넓어 피드를 밀어냄. 전용 페이지가 공간 여유 + 깃헙 관례. 홈/태그처럼 `export const dynamic = "force-dynamic"`.

### D2: 집계 = Bit + Rebit의 `createdAt`, 일별 단순 카운트
- **Status**: resolved
- **Rationale**: 활동 = Bit 1건 + Rebit 1건을 각 1로 세는 단순 카운트(가중치 없음). `getGarden()`이 지난 1년 `Bit.createdAt`·`Rebit.createdAt`만 select해 JS로 일별 합산. BitPoint 가중치(글1·Rebit0.5)는 non-goal이라 적용 안 함. Prisma 날짜 group by(대안)는 raw SQL 필요해 JS 집계로 단순화.

### D3: 강도 = 고정 임계 4단계
- **Status**: resolved
- **Rationale**: 일별 활동 수 n → `0`(빈칸) / `1–2`(L1) / `3–4`(L2) / `5–6`(L3) / `7+`(L4). 상대 분위수(대안)는 소규모 데이터에서 불안정·복잡해 고정 임계로. 깃헙식 녹색 농도.

### D4: 일자 경계 = KST(+9)
- **Status**: resolved
- **Rationale**: `createdAt`(UTC)를 KST로 변환해 `yyyy-mm-dd` 버킷에 넣는다. 한국 사용자 기준 자정 경계가 맞아야 "오늘"이 직관적. UTC 그대로(대안)는 오전 9시 이전 활동이 전날로 잡힘.

### D5: 기간·그리드 = 지난 53주, 일요일 시작 열
- **Status**: assumed
- **Rationale**: 오늘(KST) 포함 지난 53주를 주(열)×요일(7행) 그리드로. 깃헙과 동일 배치. 열은 일요일 시작. 미래 칸·범위 밖 칸은 렌더 안 함.

### D6: 오늘 활동 카운트 강조
- **Status**: resolved
- **Rationale**: 그리드 위/옆에 "오늘 N개" 텍스트를 별도 강조. 사용자 최종 목표("오늘 얼마나 했는지")의 핵심이라 그리드와 별개로 명시 표시.

### D7: 집계 주체 = dev 유저
- **Status**: assumed (L1)
- **Rationale**: 인증 전이라 dev 유저(`dev@dailybit.dev`) 활동을 집계. 읽기이므로 `findUnique`로 id 확보(없으면 빈 잔디). 로그인 도입 시 유저별 파라미터화.

### D8: 홈에서 `/garden` 진입 링크
- **Status**: resolved
- **Rationale**: 홈 헤더 등에 `/garden` 링크 추가(태그 페이지의 홈 링크 패턴 반대 방향). 전용 페이지 도달 경로 확보.

## Constraints
- **스키마 변경 없음** — 기존 `Bit.createdAt`·`Rebit.createdAt` 집계만
- 일자 버킷은 KST(+9) 기준
- `/garden`은 RSC 유지(상호작용 없음), App Router
- Prisma는 `@/lib/prisma`에서만, pnpm
- 활동 = 단순 카운트(가중치 없음), Bit+Rebit

## Known Gaps
- BitPoint 가중치(글1·Rebit0.5) 미반영 — 단순 활동 수 (점수 시스템은 별도)
- 댓글 집계 없음 (댓글 기능 미구현)
- 단일 dev 유저 집계 (로그인 시 유저별 확장)
- 칸 클릭 → 그 날 활동 상세는 없음 (이번 범위 밖)
- 지난 1년 `createdAt` 전체 로드 — 소규모엔 충분, 대량 시 집계 쿼리 최적화 과제

## Requirements

### R0: /garden에서 1년 활동 잔디 확인 (goal-level)

#### R0.1: 잔디 그리드 + 오늘 카운트 표시
- **Given**: dev 유저가 여러 날에 걸쳐 Bit·Rebit 활동을 함
- **When**: `/garden`에 접근
- **Then**: 지난 1년 그리드에 활동일이 강도 색으로 표시되고, "오늘 N개" 카운트가 보임

### R1: 활동 집계 (D2·D4·D7, 서버 경계)

#### R1.1: Bit+Rebit 일별 합산
- **Given**: 어떤 날 Bit 2건·Rebit 1건이 있음
- **When**: `getGarden()` 호출
- **Then**: 그 날 활동 수가 3으로 집계됨

#### R1.2: KST 일자 버킷
- **Given**: `createdAt`이 UTC `2026-06-06T15:30Z` (= KST `2026-06-07 00:30`)
- **When**: 집계
- **Then**: KST `2026-06-07` 버킷에 카운트됨 (UTC 날짜인 06-06 아님)

#### R1.3: 지난 1년 범위 한정
- **Given**: 1년(53주) 범위를 벗어난 오래된 활동이 있음
- **When**: `getGarden()` 호출
- **Then**: 범위 밖 활동은 그리드 집계에서 제외됨

#### R1.4: 활동 없는 날은 0
- **Given**: 특정 날 활동이 전혀 없음
- **When**: 집계
- **Then**: 그 날 카운트는 0 (빈 칸으로 표현)

### R2: 강도 매핑 (D3)

#### R2.1: 고정 임계 레벨 변환
- **Given**: 일별 활동 수 0, 2, 4, 6, 8
- **When**: 강도 레벨 계산
- **Then**: 각각 L0, L1, L2, L3, L4로 매핑 (0 / 1–2 / 3–4 / 5–6 / 7+)

### R3: 그리드 렌더 (D1·D5, UI 경계)

#### R3.1: 주×요일 그리드
- **Given**: `getGarden()` 집계 결과
- **When**: `/garden` 렌더
- **Then**: 지난 53주(열)×요일(7행) 그리드가 표시되고, 각 칸이 강도 레벨 색으로 칠해짐

#### R3.2: RSC force-dynamic 페이지
- **Given**: `/garden` 접근
- **When**: 페이지 렌더
- **Then**: `export const dynamic = "force-dynamic"` RSC로 매 요청 최신 집계 SSR (`"use client"` 없음)

#### R3.3: 빈 잔디 처리
- **Given**: 활동이 전혀 없거나 dev 유저가 없음
- **When**: `/garden` 렌더
- **Then**: 에러 없이 전부 빈 칸(L0)인 그리드가 표시됨

### R4: 오늘 활동 강조 (D6)

#### R4.1: 오늘 카운트 표시
- **Given**: 오늘(KST) 활동이 3건
- **When**: `/garden` 렌더
- **Then**: "오늘 3개"가 그리드와 별개로 강조 표시됨

#### R4.2: 오늘 칸 식별
- **Given**: 그리드가 렌더됨
- **When**: 오늘 칸 확인
- **Then**: 오늘에 해당하는 칸이 테두리 등으로 구분됨

### R5: 진입 링크 (D8)

#### R5.1: 홈 → /garden 이동
- **Given**: 홈 페이지
- **When**: Garden 진입 링크 클릭
- **Then**: `/garden`으로 이동

**Coverage**: D1→R3.1/R3.2, D2→R1.1, D3→R2.1, D4→R1.2, D5→R3.1, D6→R4, D7→R1/R3.3, D8→R5. R0=goal. 경계: 집계(R1·R2) ↔ 렌더(R3·R4). 고아 결정 없음. 모든 sub-req GWT 완비.

## Tasks

### T1: Garden 집계 로직 + 순수 유틸 [BE]
- **Fulfills**: R1 (R1.1–R1.4), R2 (R2.1)
- **Depends on**: (none)
- 내용: `src/lib/garden.ts` 생성.
  - 순수 유틸: `toKstDateKey(date)`(UTC→KST yyyy-mm-dd), `activityLevel(count)`(0~4 고정 임계), `buildGardenGrid(countByDate, today)`(지난 53주 일요일 시작 주×요일 배열 생성, 범위 밖 제외).
  - `getGarden()`: dev 유저 `findUnique`(없으면 빈 집계) → 지난 1년 `Bit.createdAt`·`Rebit.createdAt` select → `toKstDateKey`로 일별 합산 → `buildGardenGrid`로 그리드 + 오늘 카운트 반환 (`GardenData` 타입: weeks·todayCount 등).
  - `src/lib/garden.test.ts`: 순수 유틸 단위 테스트(KST 경계, 레벨 임계, 그리드 형태). DB 의존 `getGarden`은 기존 관행대로 e2e/수동.

### T2: /garden 페이지 + 잔디 그리드 + 홈 링크 [vertical-UI]
- **Fulfills**: R0, R3 (R3.1–R3.3), R4 (R4.1–R4.2), R5
- **Depends on**: T1
- 내용: `src/app/garden/page.tsx`(RSC, `export const dynamic = "force-dynamic"`) — `getGarden()` 호출, "오늘 N개" 강조 + `GardenGrid` 렌더, 빈 데이터도 안전. `src/components/garden/GardenGrid.tsx`(RSC) — 주×요일 칸을 강도 레벨 색으로, 오늘 칸 테두리 표식. 홈(`src/app/page.tsx`) 헤더에 `/garden` 링크 추가. `GardenGrid` 컴포넌트 테스트(레벨 색·오늘 표식·빈 잔디).

**Coverage**: R1/R2→T1, R0/R3/R4/R5→T2. 고아 요구사항 없음.
DAG: `T1 → T2` (T2가 T1의 `getGarden`·타입에 의존, 선형).

## External Dependencies

### Pre-work
- **스키마 변경 없음** → 마이그레이션·db push 불필요 (기존 `createdAt` 집계만)
- 신규 의존성 없음 (날짜 처리는 내장 Intl/Date로 충분)

### Post-work
- `feature/garden` 브랜치 → 구현 → `pnpm test:run` + `typecheck`
- `/gemini-review`로 코드 diff 교차검증
- `git push` → `gh pr create` → CI(unit·e2e) → 머지 → Vercel 배포
- 배포 후 `/garden`에서 잔디·오늘 카운트 스모크 확인
