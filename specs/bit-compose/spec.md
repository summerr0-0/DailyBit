# Spec: bit-compose

## Meta
- **Created**: 2026-06-04
- **Type**: dev
- **Status**: approved
- **Approved by**: user
- **Approved at**: 2026-06-04

## Goal
홈에서 Bit를 작성해 피드에 바로 올리는 기능을 오늘 배포 가능한 수준으로 만든다.

## Non-goals
- 이미지/미디어 첨부
- Bit 수정·삭제
- Rebit (리포스트)
- BitThread (이어쓰기 타래)
- Garden (활동 시각화)
- 전체 인증 시스템 구축 (NextAuth full setup)

## Confirmed Goal
홈 피드 상단에 Bit 작성 폼을 두고, 사용자가 내용(500자 이내) + 태그를 입력해 제출하면 `POST /api/bits`로 저장되고 피드 최상단에 즉시 노출된다. Vercel 배포까지 완료한다.

- **포함**: 작성 폼 UI(500자 카운터, 태그 입력), `POST /api/bits`, 서버측 검증(빈 글/500자 초과/태그 정규화), 작성 후 피드 즉시 반영
- **완료 기준**: 홈에서 글 작성 → 저장 → 피드 최상단 노출, Vercel 배포 완료
- **열린 질문(L2에서 결정)**: 작성자(author) 결정 방식 — auth 미구현 상태에서 어떻게 처리할지

## Research

### 기존 읽기 경로 (재사용 대상)
- 피드 흐름: `page.tsx`(`export const dynamic = "force-dynamic"`) → `BitList`(RSC) → `getBits()` → Prisma → `BitCard` (`src/app/page.tsx`, `src/components/bits/BitList.tsx:4`, `src/lib/bits.ts:25`)
- `GET /api/bits`만 존재. **POST 핸들러 없음** (`src/app/api/bits/route.ts:4`)
- Prisma 싱글톤(PrismaPg 어댑터), `@/lib/prisma`에서만 import (`src/lib/prisma.ts`)

### 작성자(author) 관련
- 시드에 고정 dev 유저 존재: `dev@dailybit.dev` / `devuser`, upsert로 멱등 생성 → 기본 작성자로 즉시 사용 가능 (`prisma/seed.ts:10`)
- `next-auth` 미설치 — 전체 인증은 오늘 범위 밖

### 검증/도메인 규칙
- `Bit.content` = `@db.VarChar(500)`, `Bit.tags` = `String[]` (`prisma/schema.prisma`)
- 도메인 규칙: 내용 500자 이내(필수), 태그 최대 10개·소문자 정규화(#React → #react) (`docs/domain.md`)
- `zod` / `react-hook-form` 미설치 → 검증은 직접 구현 또는 zod 추가 결정 필요

### 테스트·제약
- 테스트: Vitest + React Testing Library, 컴포넌트 옆에 `*.test.tsx` 코로케이트 (`src/components/bits/BitCard.test.tsx`)
- 폼은 입력 상태·onSubmit 필요 → `"use client"` 필수 (`.claude/rules/server-component-first.md`)
- Hooks: 편집 시 `tsc --noEmit` + `prettier`; pnpm 전용; Prisma 스키마가 DB 권위 (`CLAUDE.md`)
- 스크립트: `pnpm test:run`, `pnpm typecheck`, `pnpm db:migrate`, `pnpm db:seed` (`package.json`)

## Decisions

### D1: 작성자 = 고정 dev 유저, POST 핸들러에서 find-or-create
- **Status**: resolved
- **선택**: 모든 Bit의 author를 시드 dev 유저(`dev@dailybit.dev` / `devuser`)로 귀속. POST 핸들러가 매번 email 기준 `upsert`로 작성자를 find-or-create해 시드 실행 여부와 무관하게 동작(프로덕션 DB에 시드 유저 부재 시 500 방지 — Inversion Probe에서 발견).
- **Rationale**: auth는 명시적 non-goal. 닉네임 입력(대안)은 중복·스팸·검증 복잡도를 늘리면서도 여전히 익명이라 이득이 작음. 고정 유저는 코어 쓰기 루프를 가장 단순하게 검증·배포. **Steelman 반론**: 모든 글이 한 계정에 쌓여 '가짜 SNS'이고 추후 auth 도입 시 기존 Bit의 author 마이그레이션 부담. **대응**: author 재귀속은 별도 작업으로 분리하고 Known Gaps에 명시, 오늘은 루프 완성·배포에 집중.

### D2: 작성 폼 = 홈 피드 상단 인라인 (`"use client"`)
- **Status**: resolved
- **선택**: 홈 헤더 아래 고정 인라인 폼 — textarea + 실시간 글자 카운터 + 제출 버튼. 모달/별도 페이지(대안) 대신 트위터식 인라인.
- **Rationale**: 작성→피드 노출 동선이 가장 짧고 추가 라우트·포커스 트랩 불필요. 입력 상태·onSubmit 때문에 폼만 `"use client"`, 피드는 RSC 유지(server-component-first 규칙 준수).

### D3: 피드 반영 = `router.refresh()`
- **Status**: resolved
- **선택**: 제출 성공 후 `router.refresh()`로 RSC 피드 재요청. Optimistic(대안)은 롤백·중복키 처리 복잡, 전체 새로고침은 UX 거침.
- **Rationale**: `page.tsx`가 `force-dynamic`이라 refresh 시 최신 DB 재조회 보장. 구현 단순 + 정확성 우선.

### D4: 태그 = 본문 `#태그` 자동 파싱
- **Status**: resolved
- **선택**: 별도 입력칸 없이 본문에서 `#키워드` 추출 → `tags[]`로 저장. 본문 텍스트는 원문 그대로 보존.
- **Rationale**: 입력 단계 최소화, 트위터식 UX. 별도 칸(대안)은 필드 추가 비용.

### D5: 길이/빈 글 검증 = 클라이언트 + 서버 이중
- **Status**: resolved
- **선택**: 클라이언트는 카운터 표시 + (빈 글 || 500자 초과) 시 제출 버튼 비활성. 서버는 zod로 최종 검증 후 위반 시 `400`.
- **Rationale**: 클라이언트만(대안)은 API 직접 호출 시 무방비. 서버 검증을 신뢰 경계로 두고 클라이언트는 UX 보조.

### D6: POST 실패 UX = 인라인 에러 + 입력 유지
- **Status**: resolved
- **선택**: 네트워크/서버 오류 시 폼 하단 인라인 에러 메시지, 작성 내용 보존해 재시도 가능. 토스트(대안)는 shadcn toast 추가 필요해 범위 밖.
- **Rationale**: 의존성 추가 없이 가장 적은 코드로 입력 손실 방지.

### D7: 태그 정규화 = 소문자 → 중복제거 → 앞 10개
- **Status**: resolved
- **선택**: 파싱된 태그를 소문자화(#React→react) → 중복 제거 → 10개 초과분 절삭 후 저장. 400 거부(대안) 대신 조용히 정리.
- **Rationale**: 도메인 규칙(최대 10개, 소문자) 충족하면서 작성 흐름을 끊지 않음.

### D8: 입력 검증 = zod 추가
- **Status**: resolved
- **선택**: `pnpm add zod`. POST payload 스키마(`content: string`, `tags?: string[]`)를 zod로 검증·파싱. 직접 구현(대안) 대비 타입 안전·재사용.
- **Rationale**: 소규모 의존성 1개로 서버 검증 일관성 확보. API 계약: `POST /api/bits` body `{ content: string }`, 응답 `201` + 생성된 Bit(또는 `400`/`500`).

## Constraints
- 내용은 500자 이내·빈 글 금지 (도메인 규칙)
- 태그는 소문자 정규화, 최대 10개 (도메인 규칙)
- **Prisma 스키마 변경 없음** — 기존 `Bit`/`User` 재사용, 마이그레이션 불필요
- 폼만 `"use client"`, 피드는 RSC 유지 (server-component-first)
- pnpm 전용, Prisma는 `@/lib/prisma`에서만 import
- `main` 직접 push 금지 → `feature/bit-compose` 브랜치 + PR (policies.md)

## Known Gaps
- 모든 Bit가 단일 dev 유저로 귀속 — 실제 다중 작성자/소유권은 auth 도입 시 별도 마이그레이션으로 해소 (오늘 범위 밖, 의도됨)
- Rate limiting·스팸 방지 없음 (오늘 범위 밖)

## Requirements

### R0: 홈에서 Bit를 작성해 피드에 즉시 반영 (goal-level)

#### R0.1: 작성 → 피드 노출 happy path
- **Given**: 홈 피드가 열려 있고 상단에 작성 폼이 보임
- **When**: 유효한 내용("안녕 #react")을 입력하고 제출
- **Then**: 폼이 비워지고 새 Bit가 피드 최상단에 나타남

### R1: Bit 생성 API — `POST /api/bits` (서버 경계, D1·D5·D7·D8)

#### R1.1: 유효한 본문으로 Bit 생성
- **Given**: 작성자 dev 유저가 존재(또는 R1.2로 보장)
- **When**: `POST /api/bits` body `{ content: "안녕 #react" }`
- **Then**: `201` + 생성된 Bit JSON(`id`, `content`, `tags:["react"]`, `author`) 반환, DB에 1행 추가

#### R1.2: 작성자 find-or-create (프로덕션 안전)
- **Given**: DB에 dev 유저(`dev@dailybit.dev`)가 없음
- **When**: `POST /api/bits` 요청 처리
- **Then**: 핸들러가 email 기준 `upsert`로 dev 유저를 생성하고 그 id를 `authorId`로 사용 (500 미발생)

#### R1.3: 빈 글 거부
- **Given**: -
- **When**: `POST /api/bits` body `{ content: "" }` 또는 공백만
- **Then**: `400` 반환, Bit 미생성

#### R1.4: 500자 초과 거부
- **Given**: -
- **When**: `POST /api/bits` content 길이 501
- **Then**: `400` 반환, Bit 미생성

#### R1.5: zod payload 스키마 검증
- **Given**: -
- **When**: `content` 누락 또는 비문자열로 `POST`
- **Then**: zod 파싱 실패로 `400` 반환

### R2: 작성 폼 UI — 홈 상단 인라인 (`"use client"`, D2·D5)

#### R2.1: 폼 렌더
- **Given**: 홈 페이지 로드
- **When**: 페이지 렌더
- **Then**: 헤더 아래 textarea + 글자 카운터 + 제출 버튼 표시

#### R2.2: 실시간 글자 카운터
- **Given**: 폼이 비어 있음
- **When**: 사용자가 10자 입력
- **Then**: 카운터가 `10/500` 표시 (500 초과 시 경고색)

#### R2.3: 빈 글/초과 시 제출 버튼 비활성
- **Given**: textarea가 비어 있거나 500자 초과
- **When**: 폼 상태 평가
- **Then**: 제출 버튼 `disabled`

#### R2.4: 제출 → POST 호출
- **Given**: 유효한 내용이 입력됨
- **When**: 제출 버튼 클릭
- **Then**: `POST /api/bits` 호출, 진행 중 버튼 비활성·로딩 표시

### R3: 작성 후 피드 반영 (D3)

#### R3.1: 성공 시 refresh
- **Given**: `POST`가 `201` 반환
- **When**: 클라이언트가 성공 응답 수신
- **Then**: textarea를 비우고 `router.refresh()` 호출 → RSC 피드 재요청

#### R3.2: 새 Bit 최상단 노출
- **Given**: refresh 후 `getBits()`가 새 Bit 포함, `createdAt desc` 정렬 반환
- **When**: 피드 RSC 재렌더
- **Then**: 방금 작성한 Bit가 목록 맨 위에 표시

### R4: 태그 파싱·정규화 (D4·D7, 서버 경계)

#### R4.1: 본문 `#태그` 추출 + 소문자화 + 중복제거
- **Given**: `content = "GraphQL 배우는 중 #React #react"`
- **When**: 서버에서 태그 파싱
- **Then**: `tags = ["react"]`

#### R4.2: 10개 초과 절삭
- **Given**: 본문에 서로 다른 태그 12개
- **When**: 파싱
- **Then**: 앞 10개만 `tags`에 저장

#### R4.3: 본문 원문 보존
- **Given**: `content`에 `#태그` 포함
- **When**: 저장
- **Then**: `content`는 원문 그대로(`#` 포함) 저장, `tags`는 별도 배열

### R5: 제출 에러 처리 (D6, UI 경계)

#### R5.1: POST 실패 시 인라인 에러
- **Given**: 네트워크/서버 오류로 `POST`가 비-2xx 또는 throw
- **When**: 클라이언트가 실패 감지
- **Then**: 폼 하단에 에러 메시지 표시

#### R5.2: 실패 시 입력 유지
- **Given**: 제출 실패
- **When**: 에러 표시
- **Then**: textarea의 작성 내용이 보존되어 재시도 가능

**Coverage**: D1→R1.1/R1.2, D2→R2.1, D3→R3.1/R3.2, D4→R4.1/R4.3, D5→R1.3/R1.4/R2.3, D6→R5.1/R5.2, D7→R4.1/R4.2, D8→R1.1/R1.5. 경계: API(R1) ↔ UI(R2.4 호출, R3 소비). 고아 결정 없음.

## Tasks

### T1: 태그 파싱 유틸 + createBit 서비스 + zod [infra]
- **Fulfills**: R4 (R4.1–R4.3), R1.1/R1.2 생성 로직
- **Depends on**: (none)
- 내용: `pnpm add zod`. `src/lib/tags.ts`에 `parseTags(content)` (소문자화·중복제거·앞 10개). `src/lib/bits.ts`에 `createBit({ content })` — dev 유저 email 기준 `upsert`로 author 확보 후 `parseTags` 적용해 Bit 생성, `BitWithAuthor` 형태 반환. `src/lib/tags.test.ts` 단위 테스트(추출·소문자·중복·11개 절삭).

### T2: `POST /api/bits` Route Handler [vertical-BE]
- **Fulfills**: R1 (R1.1–R1.5)
- **Depends on**: T1
- 내용: `src/app/api/bits/route.ts`에 `POST` 추가. zod 스키마(`{ content: string }`)로 파싱 → 빈 글/공백·501자 위반 시 `400` → `createBit` 호출 → `201` + Bit JSON. GET은 유지. (파일 단독 편집이라 T1 완료 후 진행)

### T3: 작성 폼 컴포넌트 + 홈 배치 + 제출·반영·에러 [vertical-FE]
- **Fulfills**: R0, R2 (R2.1–R2.4), R3 (R3.1–R3.2), R5 (R5.1–R5.2)
- **Depends on**: T2
- 내용: `src/components/bits/BitComposer.tsx` (`"use client"`) — textarea + `n/500` 카운터 + 제출 버튼. 빈 글/초과 시 버튼 `disabled`. 제출 시 `fetch POST /api/bits`, 성공 → textarea 비우고 `router.refresh()`, 실패 → 인라인 에러 + 입력 유지. `src/app/page.tsx` 헤더 아래 마운트. `src/components/bits/BitComposer.test.tsx`(렌더·빈 글 비활성·카운터).

**Coverage**: R0→T3, R1→T2, R2→T3, R3→T3, R4→T1, R5→T3. 고아 요구사항 없음. DAG: T1 → T2 → T3 (선형 — 동일 API 계약·파일 의존으로 직렬화, 거짓 병렬 없음).

## External Dependencies

### Pre-work
- `pnpm add zod` (T1에서 수행) — 신규 런타임 의존성 1개
- Prisma 스키마 변경 없음 → 마이그레이션·`db:migrate` 불필요
- dev 유저는 R1.2 `upsert`로 런타임 자동 확보 → 수동 `db:seed` 불필요

### Post-work
- `feature/bit-compose` 브랜치 → `git push` → `gh pr create` (policies.md 데일리 사이클)
- PR 머지 → Vercel 자동 배포
- 배포 후 프로덕션에서 Bit 1건 작성 스모크 확인
