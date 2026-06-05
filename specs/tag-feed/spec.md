# Spec: tag-feed

## Meta
- **Created**: 2026-06-04
- **Type**: dev
- **Status**: approved
- **Approved by**: user
- **Approved at**: 2026-06-04
- **Note**: feature/bit-compose 위에 스택(공유 파일 src/lib/bits.ts). bit-compose 머지 후 tag-feed 순서.

## Goal
피드의 `#태그`를 클릭하면 해당 태그가 달린 Bit만 모아 보여주는 태그 피드를 오늘 배포 가능한 수준으로 만든다.

## Non-goals
- 태그 검색/자동완성
- 태그 팔로우
- 인기 태그 랭킹
- 페이지네이션/무한 스크롤
- 태그 편집/삭제

## Confirmed Goal
`BitCard`의 태그를 링크화하여 클릭 시 `/tags/[tag]` 라우트로 이동, 해당 태그가 포함된 Bit를 최신순으로 표시한다. 태그가 없으면 빈 상태를 보여준다. Vercel 배포까지 완료.

- **포함**: 태그 링크화, `/tags/[tag]` 페이지(RSC), 태그별 Bit 조회, 빈 상태 처리, 소문자 매칭
- **완료 기준**: 피드에서 `#react` 클릭 → `/tags/react` → react 태그 Bit만 표시, 배포 완료

## Research

### 재사용 자산
- `BitCard` (RSC)에서 태그를 `#{tag}` span으로 렌더 중, 링크 아님 (`src/components/bits/BitCard.tsx:15-19`) → `next/link`로 감싸 링크화 (RSC 유지)
- `BitList` (RSC) → `getBits()` → `BitCard` 패턴 재사용 가능 (`src/components/bits/BitList.tsx`)
- `getBits()` / `BitWithAuthor` 매핑 로직 존재 → 태그 필터 버전 추가 시 동일 select·매핑 재사용 (`src/lib/bits.ts:24`)
- 태그는 소문자 정규화·중복제거되어 `Bit.tags: String[]`에 저장 (`src/lib/tags.ts`, `prisma/schema.prisma`)

### 기술 포인트
- Prisma 배열 필터: `where: { tags: { has: tag } }`로 특정 태그 포함 Bit 조회
- App Router 동적 세그먼트: `src/app/tags/[tag]/page.tsx`, `params.tag`는 URL 인코딩됨(한글 태그) → `decodeURIComponent` + `toLowerCase` 정규화 필요
- `force-dynamic` 패턴: 홈처럼 동적 렌더(`src/app/page.tsx:3`)

### 제약
- App Router only, 페이지는 `src/app/**` (`.claude/rules/app-router-only.md`)
- Server Component first — 링크는 RSC로 충분, `"use client"` 불필요 (`.claude/rules/server-component-first.md`)
- Prisma는 `@/lib/prisma`에서만, 스키마 변경 없음
- 테스트: Vitest 코로케이트 (`src/components/bits/BitCard.test.tsx`)

## Decisions

### D1: 태그 링크화 — `BitCard`에서 `next/link` (RSC 유지)
- **Status**: assumed (L1)
- **선택**: `BitCard`의 태그 span을 `<Link href={`/tags/${tag}`}>`로 감쌈. 컴포넌트는 server component 유지.
- **Rationale**: 링크는 hooks/이벤트 불필요 → `"use client"` 전환 불필요(server-component-first). `BitCard`는 홈·태그 페이지 양쪽에서 재사용되므로 한 곳 수정으로 전파.

### D2: 라우트 = `src/app/tags/[tag]/page.tsx` (force-dynamic RSC)
- **Status**: resolved
- **선택**: App Router 동적 세그먼트. 홈과 동일하게 `export const dynamic = "force-dynamic"`.
- **Rationale**: app-router-only 규칙 준수. 빌드 타임 DB 연결 회피(기존 패턴 일관).

### D3: 조회 = `getBitsByTag(tag)` + Prisma `tags has`
- **Status**: resolved
- **선택**: `src/lib/bits.ts`에 `getBitsByTag(tag)` 추가 — `where: { tags: { has: tag } }`, `createdAt desc`, `getBits`와 동일 select·`BitWithAuthor` 매핑 재사용.
- **Rationale**: 기존 매핑 로직 재사용으로 중복 최소화. 배열 컬럼 `has` 필터는 인덱스 없이도 소규모 데이터에 충분.

### D4: 케이스 정규화 = `toLowerCase`로 관대 매칭
- **Status**: resolved
- **선택**: `params.tag`(Next.js가 이미 URL-디코드함)를 `toLowerCase()`만 적용해 조회. redirect(대안) 대신 어떤 케이스로 들어와도 동작.
- **Rationale**: 태그는 소문자로 저장되므로 param 소문자화로 충분. **Next App Router params는 자동 디코드**되므로 `decodeURIComponent` 추가 시 한글 태그 더블 디코딩 위험 → 사용 안 함.

### D5: 빈 결과 = 빈 상태 메시지 (404 아님)
- **Status**: resolved
- **선택**: 조회 결과 0개면 `notFound()` 대신 "#{tag}로 작성된 Bit가 없어요" 빈 상태 표시. 헤더는 유지.
- **Rationale**: 홈 빈 피드(`BitList`)와 UX 일관. 오타·없는 태그도 부드럽게 처리.

### D6: 헤더 = `#태그 · N Bits` + 홈 링크
- **Status**: resolved
- **선택**: 페이지 상단에 `#{tag}`와 개수 표시 + 홈으로 돌아가는 링크. 개수 `N`은 별도 count 쿼리 없이 조회된 `bits.length` 사용.
- **Rationale**: 맥락 명확성 + 추가 쿼리 비용 0.

## Constraints
- 태그는 소문자 정규화되어 저장됨 — URL param도 소문자화해 매칭
- **Prisma 스키마 변경 없음** — 기존 `Bit.tags` 재사용, 마이그레이션 불필요
- App Router only, 페이지는 `src/app/tags/[tag]/page.tsx`
- 태그 링크·페이지는 RSC 유지 (`"use client"` 금지)
- `main` 직접 push 금지 → `feature/tag-feed` 브랜치 + PR

## Known Gaps
- 페이지네이션 없음 — 태그당 Bit가 매우 많아지면 전체 로드 (오늘 범위 밖)
- 인기 태그·태그 목록 인덱스 페이지 없음 (오늘 범위 밖)
- `tags` 배열 컬럼에 DB 인덱스 없음 — 대량 데이터 시 성능 과제 (오늘 범위 밖)

## Requirements

### R0: 태그 클릭 → 태그 피드 (goal-level)

#### R0.1: 태그 클릭으로 필터된 목록 진입
- **Given**: 홈 피드에 `#react`가 달린 Bit가 보임
- **When**: 사용자가 `#react` 링크 클릭
- **Then**: `/tags/react`로 이동, react 태그 Bit만 최신순으로 표시

### R1: 태그 링크화 (D1, UI 경계)

#### R1.1: `BitCard` 태그가 링크로 렌더
- **Given**: `tags = ["react", "dailybit"]`인 Bit
- **When**: `BitCard` 렌더
- **Then**: 각 태그가 `/tags/react`, `/tags/dailybit`로 가는 링크로 표시

#### R1.2: 태그 외 영역 회귀 없음
- **Given**: `BitCard` 렌더
- **When**: 본문·작성자·상대시간 영역 확인
- **Then**: 기존 표시가 그대로 유지됨 (기존 BitCard 테스트 통과)

### R2: 태그 피드 페이지 (D2·D3·D4, 서버 경계)

#### R2.1: 태그별 Bit 조회
- **Given**: react 포함 Bit 2개, react 없는 Bit 1개 존재
- **When**: `getBitsByTag("react")` 호출
- **Then**: react 포함 Bit 2개만 `createdAt desc`로 반환

#### R2.2: `/tags/[tag]` 렌더
- **Given**: `/tags/react` 접근
- **When**: 페이지 렌더
- **Then**: react 태그 Bit 목록이 `BitCard`로 표시

#### R2.3: 대/혼합 케이스 관대 매칭
- **Given**: react 태그 Bit 존재
- **When**: `/tags/React` 접근
- **Then**: `toLowerCase` 매칭으로 react 목록과 동일하게 표시

#### R2.4: 한글 태그 처리
- **Given**: `일상` 태그 Bit 존재
- **When**: `/tags/일상`(인코딩 URL) 접근
- **Then**: Next 자동 디코드 + 소문자 매칭으로 일상 Bit 표시

### R3: 빈 결과 처리 (D5)

#### R3.1: 0개 시 빈 상태 메시지
- **Given**: `nosuchtag` 태그 Bit 0개
- **When**: `/tags/nosuchtag` 접근
- **Then**: 404가 아닌 페이지 + "#nosuchtag로 작성된 Bit가 없어요" 표시, 헤더 유지

### R4: 페이지 헤더 (D6)

#### R4.1: 태그명 + 개수
- **Given**: react 태그 Bit 3개
- **When**: `/tags/react` 렌더
- **Then**: 헤더에 `#react`와 `3 Bits` 표시

#### R4.2: 홈으로 돌아가기
- **Given**: 태그 페이지에 있음
- **When**: 헤더의 홈 링크 클릭
- **Then**: `/`로 이동

**Coverage**: D1→R1, D2→R2.2, D3→R2.1, D4→R2.3/R2.4, D5→R3.1, D6→R4. 경계: 조회(R2.1) ↔ 렌더(R2.2)·링크 생산(R1.1). 고아 결정 없음. 모든 sub-req GWT 완비.

## Tasks

### T1: `getBitsByTag(tag)` 서비스 [BE]
- **Fulfills**: R2.1
- **Depends on**: (none)
- 내용: `src/lib/bits.ts`에 `getBitsByTag(tag: string)` 추가 — `tag.toLowerCase()`로 정규화, `where: { tags: { has: 정규화태그 } }`, `createdAt desc`, `getBits`와 동일 select·`BitWithAuthor` 매핑 재사용.

### T2: `BitCard` 태그 링크화 [UI]
- **Fulfills**: R1 (R1.1–R1.2)
- **Depends on**: (none) — T1과 파일 무겹침, 병렬 가능
- 내용: `src/components/bits/BitCard.tsx`의 태그 span을 `next/link`로 `/tags/${tag}` 링크화(RSC 유지, hover 스타일 추가). 본문·작성자 영역 불변. `BitCard.test.tsx`에 "태그가 /tags/<tag> 링크" 단언 추가(기존 테스트 유지).

### T3: `/tags/[tag]` 페이지 [vertical]
- **Fulfills**: R0, R2.2, R2.3, R2.4, R3, R4
- **Depends on**: T1 (R0 end-to-end는 T2의 링크도 필요)
- 내용: `src/app/tags/[tag]/page.tsx` (RSC, `export const dynamic = "force-dynamic"`). `params.tag`(Next 자동 디코드) → `getBitsByTag` 호출. 헤더 `#{tag} · N Bits` + 홈 링크(R4). 목록은 `BitCard` 재사용. 0개면 빈 상태 메시지(R3). 홈(`page.tsx`) 레이아웃과 시각 일관.

**Coverage**: R0→T3, R1→T2, R2.1→T1, R2.2/2.3/2.4→T3, R3→T3, R4→T3. 고아 요구사항 없음.
DAG: `T1 ─┐` / `T2 ─┤(병렬)` / `T3 ← T1`. 직렬 실행 시 T1 → T2 → T3 권장.

## External Dependencies

### Pre-work
- 신규 의존성 없음 (zod 등 기설치, Prisma `has` 필터는 내장)
- Prisma 스키마 변경 없음 → 마이그레이션 불필요

### Post-work
- `feature/tag-feed` 브랜치 → `git push` → `gh pr create`
- PR 머지 → Vercel 자동 배포
- 배포 후 태그 클릭 → 필터 목록 스모크 확인
