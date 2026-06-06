# Spec: inline-hashtag-links

## Meta
- **Created**: 2026-06-05
- **Type**: dev
- **Status**: approved
- **Approved by**: user
- **Approved at**: 2026-06-05

## Goal
Bit 본문 텍스트 안의 `#태그`를 인라인 링크(`/tags/[tag]`)로 렌더한다. 예: 본문 "나의#일상"에서 "나의"는 일반 텍스트, "#일상"만 클릭 가능한 태그 링크.

## Non-goals
- 태그 추출/정규화 로직(`parseTags`) 변경
- `/tags/[tag]` 페이지 자체 변경
- 새로운 태그 기능(검색·자동완성·인기 태그 등)
- 본문의 다른 인라인 요소(마크다운, @멘션, URL 등) 파싱

## Confirmed Goal
`BitCard` 본문 렌더링을 토큰 분할로 바꿔 `#태그`만 `/tags` 링크로, 나머지는 일반 텍스트로 표시한다. 홈·태그피드 양쪽이 같은 `BitCard`를 쓰므로 공통 적용된다.

- **완료 기준**: 본문 "나의#일상"의 "#일상" 클릭 → `/tags/일상` 이동, "나의"는 일반 텍스트로 유지

## Research
- `BitCard`(RSC)는 본문을 `{bit.content}` plain text로 출력하고, 태그는 카드 하단에 별도 칩으로 표시 (`src/components/bits/BitCard.tsx`)
- 태그 추출 정규식 `/#([\p{L}\p{N}_]+)/gu` — 한글·숫자·`_` 지원, `#` 앞 공백 불요 → "나의#일상"의 "#일상"도 매칭 (`src/lib/tags.ts:1`)
- `parseTags`: 소문자 정규화·중복 제거·최대 10개, 본문 텍스트는 변형하지 않음 (`src/lib/tags.ts:12`)
- 태그 링크 href는 `/tags/{tag}`, 태그 페이지는 `param.toLowerCase()`로 매칭 (`src/app/tags/[tag]/page.tsx:14`)
- 하단 칩은 `bit.tags`(이미 정규화·중복제거된 배열)를 map해 `/tags/{tag}` Link 렌더 (`src/components/bits/BitCard.tsx`)
- 테스트: Vitest 코로케이트, `BitCard.test.tsx`·`tags.test.ts` 존재
- 제약 문서: RSC 우선(`.claude/rules/server-component-first.md`), App Router only

## Decisions

### D1: 본문 토큰 분할 렌더 (RSC)
- **Status**: assumed (L1)
- **Rationale**: 본문 문자열을 `#태그` 경계로 분할해 `#태그`는 `<Link>`, 나머지는 텍스트 노드로 렌더. dangerouslySetInnerHTML(대안)은 XSS 위험·React 비관용이라 기각. 링크는 hooks/이벤트 불필요 → RSC 유지, `"use client"` 불필요(server-component-first).

### D2: 매칭 정규식 = `tags.ts` 패턴 재사용
- **Status**: assumed (L1)
- **Rationale**: `src/lib/tags.ts`의 `/#([\p{L}\p{N}_]+)/gu`를 export해 공유. 본문 렌더와 태그 추출이 **동일 규칙**을 쓰도록 보장(불일치 방지). 새 정규식 작성(대안)은 두 곳이 어긋날 위험.

### D3: 표시 = 원문 그대로, 링크 = 소문자 href
- **Status**: resolved
- **Rationale**: 본문 `#React`는 화면에 `#React`로 표시, href는 `/tags/react`(소문자). 본문 텍스트를 변형하지 않는 `parseTags` 원칙과 일치. 표시까지 소문자화(대안)는 사용자 원문을 바꿔 보여 기각.

### D4: 하단 태그 칩 제거 (인라인만)
- **Status**: resolved
- **Rationale**: 본문에서 태그가 바로 링크로 보이므로 하단 칩은 중복. 제거해 카드를 간결하게. 둘 다 유지(대안)는 중복 표시라 기각. `bit.tags` 데이터는 유지(태그 피드 조회·메타에 계속 사용), UI 칩만 제거.

### D5: 본문 모든 `#토큰` 링크화 (등장마다)
- **Status**: assumed
- **Rationale**: 본문에 등장하는 모든 `#태그` 토큰을 등장할 때마다 링크화. 저장 `tags`의 10개 제한은 메타데이터용이고, 본문 표시는 원문 기준이라 별개. 등장 위치별 링크가 자연스러움.

## Constraints
- 본문 텍스트 원문 보존 — 표시 시 내용 변형 없음 (`parseTags` 원칙)
- `BitCard`는 RSC 유지, `"use client"` 금지
- App Router only, 태그 링크 href는 `/tags/{소문자}`
- `parseTags`·Prisma 스키마·`bit.tags` 데이터 구조 변경 없음 (UI 렌더만 변경)
- `tags.ts` 정규식을 단일 출처로 공유 (본문 렌더 ↔ 태그 추출 일치)

## Known Gaps
- 본문의 11번째 이후 `#토큰`도 링크되지만 `bit.tags`(상위 10개)에는 없을 수 있음 — 클릭은 동작하나 해당 글이 그 태그 피드에 안 잡힐 수 있음 (저장 메타 vs 본문 표시 불일치, 의도됨)
- 인접·특수 케이스(`##일상`, `#` 단독, `#` 뒤 공백)는 `tags.ts` 정규식 매칭 규칙을 그대로 따름

## Requirements

### R0: 본문 #태그 클릭 → 태그 피드 (goal-level)

#### R0.1: 본문 내 태그 클릭으로 태그 피드 진입
- **Given**: 피드에 본문이 "나의#일상"인 Bit가 보임
- **When**: 사용자가 본문의 "#일상"을 클릭
- **Then**: `/tags/일상`으로 이동하고, "나의"는 일반 텍스트로 표시됨

### R1: 본문 토큰 분할 인라인 렌더 (D1·D2·D5)

#### R1.1: #태그 토큰이 인라인 링크로 렌더
- **Given**: 본문이 "오늘 #개발 했다"인 Bit
- **When**: `BitCard`가 렌더됨
- **Then**: "#개발"이 `/tags/개발` 링크로, "오늘 "·" 했다"는 일반 텍스트로 표시

#### R1.2: 공백 없이 붙은 #태그도 분리
- **Given**: 본문이 "나의#일상"인 Bit
- **When**: 렌더됨
- **Then**: "나의"는 텍스트, "#일상"만 `/tags/일상` 링크로 분리 렌더

#### R1.3: 같은/여러 태그가 등장할 때마다 링크
- **Given**: 본문이 "#a 그리고 #b 또 #a"인 Bit
- **When**: 렌더됨
- **Then**: 세 토큰(#a, #b, #a) 모두 각각 링크로 렌더 (중복 등장도 모두)

#### R1.4: 태그 없는 본문은 회귀 없음
- **Given**: 본문이 "그냥 평범한 글"인 Bit
- **When**: 렌더됨
- **Then**: 본문 텍스트가 그대로 표시되고 링크는 생성되지 않음

#### R1.5: 매칭 규칙은 tags.ts 정규식 단일 출처
- **Given**: `tags.ts`의 `TAG_PATTERN`이 본문 렌더와 `parseTags`에서 공유됨
- **When**: 동일 본문을 양쪽에서 처리
- **Then**: 인식하는 토큰 집합이 동일 (본문 링크 대상 = `parseTags` 추출 규칙, 10개 절삭 이전 기준)

### R2: 표시·링크 케이스 규칙 (D3)

#### R2.1: 표시는 원문 케이스 보존
- **Given**: 본문이 "#React"인 Bit
- **When**: 렌더됨
- **Then**: 화면에 "#React"가 원문 그대로 표시됨

#### R2.2: 링크 href는 소문자
- **Given**: 본문이 "#React"인 Bit
- **When**: 태그 링크가 생성됨
- **Then**: href가 `/tags/react`(소문자)로 생성됨

### R3: 하단 태그 칩 제거 (D4)

#### R3.1: 카드 하단 태그 칩 미렌더
- **Given**: `tags = ["일상"]`인 Bit
- **When**: `BitCard`가 렌더됨
- **Then**: 카드 하단의 별도 태그 칩 영역이 렌더되지 않음

#### R3.2: tags 데이터는 유지
- **Given**: Bit에 `tags` 배열이 존재
- **When**: 태그 피드 조회 등 데이터 사용
- **Then**: `bit.tags` 데이터는 그대로 유지되어 조회·메타에 영향 없음 (UI 칩만 제거)

**Coverage**: D1→R1.1/R1.2, D2→R1.5, D3→R2, D4→R3, D5→R1.3. R0=goal. 경계: 본문 렌더(R1·R2) ↔ 데이터 유지(R3.2). 고아 결정 없음. 모든 sub-req GWT 완비.

## Tasks

### T1: `tags.ts`에서 `TAG_PATTERN` export [infra]
- **Fulfills**: R1.5
- **Depends on**: (none)
- 내용: `src/lib/tags.ts`의 `TAG_PATTERN` 정규식을 `export`한다. `parseTags`는 동일 상수를 계속 사용. 본문 렌더가 이 상수를 import해 같은 규칙을 공유하도록(단일 출처). 정규식은 `g` 플래그 보유 → 본문 분할 시 `lastIndex` 부작용에 주의(매 사용마다 새 RegExp 또는 `matchAll`/`split` 안전 패턴 사용).

### T2: 본문 인라인 #태그 렌더 + 하단 칩 제거 [vertical-UI]
- **Fulfills**: R0, R1.1–R1.4, R2, R3
- **Depends on**: T1
- 내용: 본문 문자열을 `TAG_PATTERN`으로 토큰 분할해 `#태그`는 `<Link href={`/tags/${태그소문자}`}>#원문</Link>`(원문 케이스 표시, 소문자 href), 나머지는 텍스트 노드로 렌더하는 헬퍼를 작성(RSC, `"use client"` 없음). `src/components/bits/BitCard.tsx`에서 `{bit.content}` 대신 이 렌더를 적용하고, 하단 태그 칩 `div`를 제거(`bit.tags` 데이터·타입은 유지). `BitCard.test.tsx`에 단언 추가: 인라인 `#태그` 링크 존재·href 소문자·원문 케이스 표시·붙은 태그 분리·중복 등장 각각 링크·태그 없는 본문 회귀·하단 칩 미렌더.

**Coverage**: R1.5→T1, R0/R1.1–R1.4/R2/R3→T2. 고아 요구사항 없음.
DAG: `T1 → T2` (T2가 T1의 export된 정규식에 의존, 선형).

## External Dependencies

### Pre-work
- 신규 의존성 없음 (`next/link` 기설치, 정규식 내장)
- Prisma 스키마·`parseTags` 동작 변경 없음 → 마이그레이션 불필요

### Post-work
- `feature/inline-hashtag-links` 브랜치 → 구현 → `pnpm test:run` + `typecheck`
- `/gemini-review`로 코드 diff 교차검증
- `git push` → `gh pr create` → CI(unit·e2e) → PR 머지 → Vercel 배포
- 배포 후 본문 태그 클릭 스모크 확인
