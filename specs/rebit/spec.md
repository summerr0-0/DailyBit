# Spec: rebit

## Meta
- **Created**: 2026-06-05
- **Type**: dev
- **Status**: approved
- **Approved by**: user
- **Approved at**: 2026-06-05

## Goal
사용자가 원본 Bit를 자기 피드로 리포스트(Rebit)한다. 피드에는 "OO님이 Rebit함" 표시와 함께 원본 Bit(작성자·내용·태그)가 보인다.

## Non-goals
- 인용 Rebit (코멘트 추가해서 공유)
- BitPoint 점수 시스템 전체 구현 (Rebit 0.5pt 적립 로직)
- 알림 / 활동 피드
- 전체 인증 시스템 (작성자/주체는 고정 dev 유저)

## Confirmed Goal
`BitCard`에 Rebit 버튼을 두고, 클릭 시 원본 Bit를 현재 사용자(고정 dev 유저)가 Rebit한다. 홈 피드는 원본 Bit와 Rebit를 시간순으로 함께 보여주며, Rebit 항목은 "OO님이 Rebit함" 헤더 + 원본 Bit 내용으로 렌더된다. Rebit 카운트를 카드에 표시한다.

- **완료 기준**: 피드에서 Bit의 Rebit 버튼 클릭 → 홈 피드 최상단에 "devuser님이 Rebit함" + 원본 Bit 표시, 카운트 증가
- **현 제약**: 인증 전이라 단일 dev 유저 기준 동작 (메커니즘 구축이 목적, 인증 도입 시 다중 유저로 작동)

## Research
- 피드 흐름: `page.tsx`(force-dynamic) → `BitList`(RSC) → `getBits()` → `BitCard` (`src/app/page.tsx`, `src/components/bits/BitList.tsx`, `src/lib/bits.ts:43`)
- `getBits()`는 `Bit.findMany`(createdAt desc) → `BitWithAuthor[]` 매핑 (`src/lib/bits.ts:43`)
- `BitWithAuthor` 타입: id·content·tags·createdAtLabel·author (`src/lib/bits.ts:10`) → Rebit 표시 위해 피드 아이템 타입 확장 필요
- 쓰기 패턴: `POST /api/bits` route handler → zod 검증 → `createBit` (`src/app/api/bits/route.ts`, `src/lib/bits.ts:87`)
- 작성 주체 확보: `createBit`가 dev 유저(`dev@dailybit.dev`)를 email 기준 `upsert` (`src/lib/bits.ts:88`) → Rebit 주체도 동일 패턴 재사용
- 클라이언트 상호작용 패턴: `BitComposer`("use client")가 `fetch POST` 후 `router.refresh()` (`src/components/bits/BitComposer.tsx`) → Rebit 버튼도 동일 패턴 적용 가능
- 스키마: `User`, `Bit`만 존재. Rebit 저장 모델 신규 필요 (`prisma/schema.prisma`)
- 제약 문서: Prisma 스키마가 DB 권위(`.claude/rules/prisma-schema-authority.md`), 스키마 변경 시 `pnpm db:migrate` + `db:generate`, RSC 우선, App Router only
- 주의(미머지 PR): `feature/inline-hashtag-links`(#10)가 `BitCard`를 인라인 태그 렌더로 변경 중 → Rebit가 `BitCard`를 건드리면 같은 라인. #10 머지 후 main 기준으로 구현 권장

## Decisions

### D1: 별도 `Rebit` 모델
- **Status**: resolved
- **Rationale**: `Rebit { id, userId, bitId, createdAt, @@unique([userId, bitId]) }` + `User`/`Bit` 관계, `onDelete: Cascade`(원본 Bit·유저 삭제 시 Rebit 정리). Bit self-relation(대안)은 content가 빈 Bit 행·중복 방지·카운트 처리가 복잡해 기각. 별도 모델이 카운트·중복방지·토글을 가장 단순하게 표현.

### D2: Rebit 토글 (생성/취소)
- **Status**: resolved
- **Rationale**: 버튼 재클릭 시 Rebit 취소. `@@unique([userId, bitId])`로 중복을 막고, 존재하면 삭제(취소)·없으면 생성. 일회성(대안)은 오조작을 되돌릴 수 없어 기각(트위터·인스타 모두 토글).

### D3: 자기 글 Rebit 허용
- **Status**: resolved
- **Rationale**: 트위터(X) 관례대로 자기 Bit도 Rebit 가능. 금지(대안)는 단일 dev 유저 환경에서 모든 글을 Rebit 불가로 만들어 기능 검증 자체가 불가능.

### D4: 피드 통합 = Bit + Rebit 시간순 병합
- **Status**: assumed
- **Rationale**: `getFeed()`가 Bit(자체 `createdAt`)와 Rebit(자체 `createdAt`) 항목을 조회해 시각 기준 병합·정렬. 피드 아이템에 `kind: "bit" | "rebit"`와, Rebit면 `rebitedBy`·`rebitedAt`를 포함. 같은 Bit가 원본+Rebit로 함께 등장할 수 있음(트위터식, 단순 시간순). 별도 정렬 알고리즘(대안)은 범위 밖.

### D5: Rebit 카운트 + 현재 유저 Rebit 여부
- **Status**: assumed
- **Rationale**: 각 Bit의 Rebit 수를 `_count`로 조회해 카드에 표시하고, 현재(dev) 유저의 Rebit 존재 여부로 버튼 활성 상태를 결정(토글 UI). 별도 카운터 컬럼(대안)은 동기화 부담이라 기각.

### D6: Rebit 주체 = dev 유저 upsert
- **Status**: assumed (L1)
- **Rationale**: `createBit`와 동일하게 dev 유저(`dev@dailybit.dev`)를 email 기준 `upsert`로 확보. 인증은 명시적 non-goal.

### D7: API = `POST`/`DELETE /api/rebits` (body `{ bitId }`)
- **Status**: assumed (L1)
- **Rationale**: 기존 `/api/bits` route handler 패턴 재사용. `POST`로 Rebit 생성, `DELETE`로 취소(토글). zod로 `bitId` 검증. 단일 토글 엔드포인트(대안)도 가능하나 REST 의미가 모호해 분리.

### D8: Rebit 버튼 = `"use client"` + fetch + `router.refresh()`
- **Status**: assumed (L1)
- **Rationale**: `BitComposer` 패턴 재사용. 버튼만 client component로 분리, 카드·피드는 RSC 유지(server-component-first).

## Constraints
- 스키마 변경 → `pnpm db:migrate` + `pnpm db:generate` (prisma-schema-authority)
- `@@unique([userId, bitId])`로 중복 Rebit 방지
- `onDelete: Cascade`로 원본 Bit·유저 삭제 시 Rebit 자동 정리
- Rebit 주체는 고정 dev 유저 (인증 전)
- RSC 우선, Rebit 버튼만 `"use client"`
- Prisma 클라이언트는 `@/lib/prisma`에서만 import

## Known Gaps
- BitPoint 0.5pt 적립은 미구현 (점수 시스템 전체가 non-goal)
- 단일 dev 유저라 Rebit 주체와 원본 작성자가 같을 수 있음 (인증 도입 시 해소)
- 같은 Bit가 원본+Rebit로 피드에 중복 등장 가능 (트위터식 허용, 중복 억제는 범위 밖)
- 원본 Bit 삭제 UI는 없음 — FK `onDelete: Cascade`만 설정 (삭제 기능은 별도)

## Requirements

### R0: Rebit로 원본 Bit를 피드에 공유 (goal-level)

#### R0.1: Rebit 버튼 클릭 → 피드에 Rebit 표시
- **Given**: 피드에 Bit "B"가 보이고 아직 Rebit하지 않음
- **When**: 사용자가 B의 Rebit 버튼을 클릭
- **Then**: 홈 피드 상단에 "devuser님이 Rebit함" + 원본 B가 표시되고, B의 Rebit 카운트가 1 증가

### R1: Rebit 데이터 모델 (D1)

#### R1.1: Rebit 스키마 + 제약
- **Given**: `prisma/schema.prisma`에 `Rebit` 모델 추가
- **When**: `pnpm db:migrate` 실행
- **Then**: `userId`·`bitId`·`createdAt` 컬럼, `@@unique([userId, bitId])`, `onDelete: Cascade`(User·Bit)인 Rebit 테이블 생성

### R2: Rebit 생성/취소 API (D2·D3·D6·D7, 서버 경계)

#### R2.1: Rebit 생성
- **Given**: dev 유저가 Bit "B"를 Rebit하지 않은 상태
- **When**: `POST /api/rebits` body `{ bitId: "B" }`
- **Then**: `201`, dev 유저 upsert 후 Rebit row 1개 생성

#### R2.2: 중복 Rebit 멱등 처리
- **Given**: dev 유저가 이미 B를 Rebit함
- **When**: `POST /api/rebits` body `{ bitId: "B" }` 재요청
- **Then**: Rebit row가 추가 생성되지 않음 (`@@unique` 위반 없이 멱등 — 기존 유지 또는 명시적 처리)

#### R2.3: Rebit 취소
- **Given**: dev 유저가 B를 Rebit한 상태
- **When**: `DELETE /api/rebits` body `{ bitId: "B" }`
- **Then**: `204`(또는 200), 해당 Rebit row 삭제

#### R2.4: 없는 Rebit 취소는 안전 처리
- **Given**: dev 유저가 B를 Rebit하지 않음
- **When**: `DELETE /api/rebits` body `{ bitId: "B" }`
- **Then**: 에러 없이 안전 종료 (no-op 응답)

#### R2.5: 자기 글 Rebit 허용
- **Given**: dev 유저가 작성한 Bit "B"
- **When**: `POST /api/rebits` body `{ bitId: "B" }`
- **Then**: `201`로 정상 생성 (자기 글 차단 없음)

#### R2.6: 잘못된 payload 거부
- **Given**: -
- **When**: `POST /api/rebits` body에 `bitId` 누락 또는 비문자열
- **Then**: zod 검증 실패로 `400`

### R3: 피드 통합 조회 (D4·D5, 조회 경계)

#### R3.1: Bit + Rebit 시간순 병합
- **Given**: Bit 2개, Rebit 1개가 서로 다른 시각으로 존재
- **When**: `getFeed()` 호출
- **Then**: 3개 항목이 시각 desc로 병합 반환 (Rebit는 `rebit.createdAt` 기준)

#### R3.2: Rebit 항목 메타 포함
- **Given**: 피드에 Rebit 항목이 있음
- **When**: 피드 아이템 매핑
- **Then**: `kind: "rebit"`, `rebitedBy`(닉네임), 원본 Bit(작성자·내용·태그)가 포함됨

#### R3.3: Rebit 카운트·현재 유저 Rebit 여부 포함
- **Given**: Bit B의 Rebit 수가 N, dev 유저의 Rebit 여부가 있음
- **When**: 피드 조회
- **Then**: 각 피드 아이템에 `rebitCount: N`과 `rebitedByMe: boolean` 포함 (`_count` 활용)

### R4: 피드 표시 (D4·D8, UI 경계)

#### R4.1: Rebit 항목 렌더
- **Given**: 피드에 `kind: "rebit"` 항목 (rebitedBy="devuser")
- **When**: 렌더
- **Then**: 카드 상단에 "devuser님이 Rebit함" 헤더 + 원본 Bit 내용 표시

#### R4.2: 일반 Bit 항목 회귀 없음
- **Given**: 피드에 `kind: "bit"` 항목
- **When**: 렌더
- **Then**: 기존대로 표시 (Rebit 헤더 없음)

### R5: Rebit 버튼 + 카운트 (D5·D8, UI 경계)

#### R5.1: 버튼 + 카운트 표시
- **Given**: Bit B의 Rebit 수 N, dev 유저 Rebit 여부
- **When**: `BitCard` 렌더
- **Then**: Rebit 버튼과 카운트 N이 표시되고, Rebit한 상태면 버튼이 활성(강조) 표시

#### R5.2: 버튼 클릭 → 토글 + 피드 갱신
- **Given**: Rebit 버튼이 보임
- **When**: 클릭
- **Then**: 미Rebit면 `POST`, Rebit면 `DELETE` 호출 후 `router.refresh()`로 피드·카운트 갱신

**Coverage**: D1→R1, D2→R2.1/R2.3, D3→R2.5, D4→R3/R4, D5→R3.3/R5.1, D6→R2.1, D7→R2, D8→R5.2. R0=goal. 경계: API(R2) ↔ 버튼 호출(R5.2), 조회(R3) ↔ 표시(R4). 고아 결정 없음. 모든 sub-req GWT 완비.

## Tasks

### T1: Rebit 스키마 + 마이그레이션 [infra]
- **Fulfills**: R1.1
- **Depends on**: (none)
- 내용: `prisma/schema.prisma`에 `Rebit` 모델(`id`, `userId`, `bitId`, `createdAt`, `@@unique([userId, bitId])`, `User`/`Bit` relation `onDelete: Cascade`) 추가 + `User.rebits`·`Bit.rebits` 역관계. `pnpm db:migrate`로 마이그레이션 생성·적용, `pnpm db:generate`로 클라이언트 재생성.

### T2: Rebit 토글 서비스 + API [vertical-BE]
- **Fulfills**: R2 (R2.1–R2.6)
- **Depends on**: T1
- 내용: `src/lib/rebits.ts`에 `addRebit(bitId)`/`removeRebit(bitId)` — dev 유저 email `upsert`로 주체 확보 후 create(중복 시 멱등 처리)·delete(없으면 no-op). `src/app/api/rebits/route.ts`에 `POST`(생성)·`DELETE`(취소), zod `{ bitId: string }` 검증→위반 `400`. 자기 글 차단 없음(R2.5). 서비스·API 단위 테스트 코로케이트.

### T3: 피드 통합 조회 [BE]
- **Fulfills**: R3 (R3.1–R3.3)
- **Depends on**: T1 (T2와 파일 무겹침 → 병렬 가능)
- 내용: `src/lib/feed.ts`에 `getFeed()` — Bit와 Rebit를 조회해 시각 desc로 병합. `FeedItem` 타입(`kind: "bit"|"rebit"`, 원본 Bit 필드, `rebitedBy?`·`rebitedAt?`, `rebitCount`, `rebitedByMe`). Rebit 수는 `_count`, `rebitedByMe`는 dev 유저 기준. `getFeed` 단위 테스트(병합 순서·메타·카운트).

### T4: 피드 표시 + Rebit 버튼 [vertical-FE]
- **Fulfills**: R0, R4 (R4.1–R4.2), R5 (R5.1–R5.2)
- **Depends on**: T2, T3
- 내용: `src/components/bits/RebitButton.tsx`(`"use client"`) — 카운트·활성 상태 표시, 클릭 시 미Rebit면 `POST`·Rebit면 `DELETE` 후 `router.refresh()`. `BitCard`에 `RebitButton` 통합, `kind: "rebit"` 항목엔 "OO님이 Rebit함" 헤더 추가(일반 Bit는 회귀 없음). `BitList`/`page.tsx`가 `getFeed()`를 사용하도록 전환. `FeedItem` 타입 소비. `RebitButton`·`BitCard` 테스트(헤더·카운트·토글).

**Coverage**: R1→T1, R2→T2, R3→T3, R0/R4/R5→T4. 고아 요구사항 없음.
DAG: `T1 → (T2 ∥ T3) → T4`. T2·T3는 파일이 겹치지 않아 병렬, T4는 둘 다 의존.

## External Dependencies

### Pre-work
- **#10(inline-hashtag, BitCard 변경)·#9(composer) 머지 후 main 기준으로 구현 권장** — T4가 `BitCard`를 건드려 #10과 같은 라인이라 충돌 회피
- 신규 의존성 없음 (zod 기설치)
- 스키마 변경 있음 → T1에서 `pnpm db:migrate` 필요 (마이그레이션 파일 커밋)

### Post-work
- `feature/rebit` 브랜치 → 구현 → `pnpm test:run` + `typecheck`
- `/gemini-review`로 코드 diff 교차검증
- `git push` → `gh pr create` → CI(unit·e2e) → 머지 → Vercel 배포
- 배포 후 Rebit 토글·피드 "OO님이 Rebit함" 표시·카운트 스모크 확인
