# Spec: delete-bit

## Meta
- **Created**: 2026-06-06
- **Type**: dev
- **Status**: implemented
- **Approved by**: user
- **Approved at**: 2026-06-06
- **Note**: PR #11 구현 후 사후 백필한 문서. 태그 작업(`feature/inline-hashtag-links`)과 충돌 회피 위해 `BitCard.tsx`를 건드리지 않는 설계로 진행. Gemini 교차리뷰 1회 반영(에러 로깅).

## Goal
홈 피드의 각 Bit를 작성자가 삭제할 수 있게 한다. 오늘 배포 가능한 수준으로 만든다.

## Non-goals
- 소유자/권한 검증 (NextAuth 도입 후) — 현재 전부 DEV_USER 소유라 검증 대상 신원 없음
- BitThread(타래) 연쇄 삭제 — 스키마에 BitThread 모델 없음
- 태그 페이지(`/tags/[tag]`)에서의 삭제 — inline-hashtag 머지와 얽혀 범위 밖
- 삭제 취소(undo)/휴지통, 소프트 삭제
- 낙관적 UI 업데이트

## Confirmed Goal
홈 피드 카드에 호버 시 삭제 버튼을 노출하고, 확인(confirm) 후 `DELETE /api/bits/[id]`로 삭제한다. 성공 시 목록을 새로고침해 해당 Bit가 사라진다. 대상이 없으면 404, 서버 오류면 500.

- **포함**: DELETE 라우트, 삭제 서비스(`deleteBit`), 삭제 버튼 컴포넌트, 홈 피드 부착, confirm/실패 처리
- **완료 기준**: 홈에서 카드 호버 → 삭제 → confirm → 목록에서 사라짐, 배포 완료

## Research

### 재사용 자산
- POST 흐름이 라우트 핸들러 + 클라이언트 `fetch` 패턴 확립 (`src/app/api/bits/route.ts`, `src/components/bits/BitComposer.tsx`) → DELETE도 동일 패턴
- `BitList` (RSC) → `getBits()` → `BitCard` 매핑 (`src/components/bits/BitList.tsx`) → 카드 래퍼에 삭제 버튼 부착 지점
- `src/lib/bits.ts`의 `createBit` 인접에 mutation 함수 추가 관례

### 기술 포인트
- Prisma `deleteMany({ where: { id } })`는 대상 부재 시 예외 대신 `count: 0` 반환 → 단일 `delete`의 P2025 예외 처리 회피
- App Router 동적 세그먼트 `src/app/api/bits/[id]/route.ts`, `params`는 Promise (Next 16) → `await params`
- 삭제 후 갱신은 `router.refresh()` (서버 컴포넌트 재요청)

### 제약
- App Router only, 라우트는 `src/app/api/**/route.ts` (`.claude/rules/app-router-only.md`)
- Prisma는 `@/lib/prisma`에서만, 스키마 변경 없음 (`.claude/rules/prisma-schema-authority.md`)
- D1: 별도 API 서버 없음 — Route Handler가 모든 API 처리 (architecture.md)
- 동시 작업(`feature/inline-hashtag-links`)이 `BitCard.tsx` 점유 → 비침습 필수
- 테스트: Vitest 코로케이트

## Decisions

### D1: 삭제 API = DELETE Route Handler (Server Action 아님)
- **Status**: resolved
- **선택**: `src/app/api/bits/[id]/route.ts`에 `DELETE` 핸들러. 204 / 404 / 400 / 500.
- **Rationale**: architecture.md D1(Route Handler가 모든 API)·기존 create(POST) 흐름과 일관. Server Action 전환은 코드베이스 컨벤션과 어긋남. (Gemini가 Server Action 권장했으나 일관성 근거로 기각.)

### D2: 삭제 서비스 = `deleteBit(id)` + `deleteMany` → boolean
- **Status**: resolved
- **선택**: `src/lib/bits.ts`에 `deleteBit(id): Promise<boolean>` 추가. `deleteMany` count로 실삭제 여부 반환, 호출부에서 false면 404.
- **Rationale**: 대상 부재를 예외가 아닌 boolean으로 다뤄 라우트 분기가 단순. PK 조회라 부하 무의미.

### D3: 삭제 버튼 = 클라이언트 컴포넌트 + confirm
- **Status**: resolved
- **선택**: `src/components/bits/DeleteBitButton.tsx` (`"use client"`). `window.confirm` 후 `fetch(DELETE)`, 성공 시 `router.refresh()`, 실패 시 `alert` + 버튼 재활성화.
- **Rationale**: onClick·상태 필요 → 클라이언트 경계. confirm으로 오삭제 방지(인증 전 단계 안전장치).

### D4: 부착 = `BitList` 래퍼 (BitCard 비침습), 홈 피드 한정
- **Status**: resolved
- **선택**: `BitList`에서 `BitCard`를 `group relative` 래퍼로 감싸 우상단 `absolute`에 호버 노출 삭제 버튼 배치. `BitCard.tsx`는 미수정.
- **Rationale**: 동시 작업이 `BitCard.tsx`를 점유 → 머지 충돌 회피. 타임스탬프가 좌측 정렬이라 우상단 비어 겹침 위험 낮음.

### D5: 권한 검증 = 없음 (인증 도입 후 후속)
- **Status**: assumed (L1)
- **선택**: 소유자 확인 없이 id로 삭제. 주석·PR에 한계 명시.
- **Rationale**: NextAuth 미도입 → 비교할 신원 없음. 전부 DEV_USER 소유. (Gemini가 Critical로 지적했으나 현 단계 구현 불가 → 후속 과제로 보류.)

### D6: 서버 오류 로깅 = catch에서 `console.error`
- **Status**: resolved
- **선택**: 500 응답 전 `console.error(원인)` 기록.
- **Rationale**: Gemini 리뷰 반영 — 에러를 통째로 삼키면 운영 추적 불가. 싸고 명확한 개선.

## Constraints
- **Prisma 스키마 변경 없음** — 기존 `Bit` 재사용, 마이그레이션 불필요
- App Router only, 라우트는 `src/app/api/bits/[id]/route.ts`
- `BitCard.tsx` 미수정 (동시 작업 충돌 회피)
- `main` 직접 push 금지 → `feature/delete-bit` 브랜치 + PR

## Known Gaps
- 소유자 권한 검증 없음 — id만 알면 누구나 삭제 (인증 도입 후 ownership 가드 필요)
- 태그 페이지 삭제 미지원 (오늘 범위 밖)
- `router.refresh()`가 갱신 완료를 보장 안 함 — 삭제~사라짐 사이 짧은 간극 가능 (경미, 범위 밖)
- 낙관적 업데이트 없음

## Requirements

### R0: 카드 삭제 (goal-level)

#### R0.1: 호버 → 삭제 → 목록에서 사라짐
- **Given**: 홈 피드에 Bit가 보임
- **When**: 카드 호버 후 삭제 버튼 클릭 → confirm 수락
- **Then**: DELETE 요청 성공, 목록 새로고침으로 해당 Bit 사라짐

### R1: 삭제 API (D1·D2·D6, 서버 경계)

#### R1.1: 삭제 성공 시 204
- **Given**: 존재하는 Bit id
- **When**: `DELETE /api/bits/[id]`
- **Then**: 204, DB에서 삭제됨

#### R1.2: 대상 없음 시 404
- **Given**: 존재하지 않는 id
- **When**: `DELETE /api/bits/[id]`
- **Then**: 404 + 에러 메시지 (예외 아님, `deleteMany` count=0)

#### R1.3: 서버 오류 시 500 + 로깅
- **Given**: 삭제 중 DB 오류
- **When**: `DELETE /api/bits/[id]`
- **Then**: 500 응답 + `console.error`로 원인 기록

### R2: 삭제 버튼 (D3, UI 경계)

#### R2.1: confirm 수락 시 DELETE 요청 + 새로고침
- **Given**: 삭제 버튼 렌더
- **When**: 클릭 → confirm 수락
- **Then**: `/api/bits/<id>` DELETE 호출, 성공 시 `router.refresh()`

#### R2.2: confirm 취소 시 무동작
- **Given**: 삭제 버튼 렌더
- **When**: 클릭 → confirm 취소
- **Then**: 요청·새로고침 모두 없음

#### R2.3: 실패 시 재시도 가능
- **Given**: DELETE가 실패(ok=false) 응답
- **When**: 삭제 시도
- **Then**: 새로고침 안 함, 안내 후 버튼 재활성화

### R3: 피드 부착 (D4, UI 경계)

#### R3.1: 홈 피드 카드마다 삭제 버튼
- **Given**: 홈 피드 Bit 목록
- **When**: `BitList` 렌더
- **Then**: 각 카드에 호버 노출 삭제 버튼, 본문·작성자 영역 회귀 없음

**Coverage**: D1→R1.1, D2→R1.2, D6→R1.3, D3→R2, D4→R3. 경계: API(R1) ↔ 버튼(R2) ↔ 부착(R3). 고아 결정 없음.

## Tasks

### T1: `deleteBit(id)` 서비스 [BE]
- **Fulfills**: R1.2
- **Depends on**: (none)
- 내용: `src/lib/bits.ts`에 `deleteBit(id): Promise<boolean>` 추가 — `deleteMany({ where: { id } })`의 count로 실삭제 여부 반환.

### T2: `DELETE /api/bits/[id]` 라우트 [BE]
- **Fulfills**: R1.1, R1.2, R1.3
- **Depends on**: T1
- 내용: `src/app/api/bits/[id]/route.ts`. `await params`로 id, 빈 값 400, `deleteBit` false면 404, 성공 204, catch에서 `console.error` + 500. 테스트 코로케이트.

### T3: `DeleteBitButton` 컴포넌트 [UI]
- **Fulfills**: R2 (R2.1–R2.3)
- **Depends on**: (none) — T2와 병렬 가능
- 내용: `src/components/bits/DeleteBitButton.tsx` (`"use client"`). confirm → DELETE fetch → `router.refresh()`/실패 처리. 테스트 코로케이트.

### T4: `BitList` 부착 [UI]
- **Fulfills**: R0, R3.1
- **Depends on**: T3 (R0 end-to-end는 T2도 필요)
- 내용: `BitList`에서 `BitCard`를 `group relative` 래퍼로 감싸 우상단에 `DeleteBitButton` 배치. `BitCard.tsx` 미수정.

**Coverage**: R0→T4, R1→T1/T2, R2→T3, R3→T4. 고아 요구사항 없음.
DAG: `T1 → T2`, `T3 (병렬)`, `T4 ← T3`. 직렬 시 T1 → T2 → T3 → T4.

## External Dependencies

### Pre-work
- 신규 의존성 없음 (Prisma `deleteMany` 내장)
- Prisma 스키마 변경 없음 → 마이그레이션 불필요

### Post-work
- `feature/delete-bit` 브랜치 → `git push` → `gh pr create` (PR #11)
- PR 머지 → Vercel 자동 배포
- 배포 후 카드 삭제 스모크 확인
- 후속: NextAuth 도입 시 삭제에 소유자 권한 가드 추가
