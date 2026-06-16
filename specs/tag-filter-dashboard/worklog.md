# Tag Filter Dashboard (역량 태그 필터) — Worklog

## 목표

SNS 타임라인(Rebit 혼합 피드) → 역량 태그 필터 대시보드로 메인 화면 교체.
면접관이 들어왔을 때 특정 도메인 태그만 선택해 관련 기록을 즉시 볼 수 있는 구조.

## 구현 범위

### lib/bits.ts 추가
- `getBitsFiltered(filterTags: string[])`: 태그 AND 교집합 필터링. 태그 없으면 전체 반환
- `getTagCloud()`: 전체 Bit의 태그 사용 빈도 집계, 내림차순 반환

### 새 컴포넌트
- `src/components/bits/TagFilterBar.tsx` (Client): 태그 칩 토글 + URL params 업데이트(`useRouter.push`)
- `src/components/bits/TagFilterSection.tsx` (Server): `getTagCloud()` 페치 후 `TagFilterBar`에 전달

### 기존 컴포넌트 변경
- `BitList.tsx`: `getFeed()` → `getBitsFiltered(filterTags)` 교체. Rebit 표시 제거. 빈 목록 메시지 필터 인식
- `src/app/page.tsx`: `searchParams.tags` 파싱 → `TagFilterSection` + `BitList`에 전달

## 기술 결정

- URL 기반 필터링 (`/?tags=nextjs,prisma`): Server Component로 필터 적용 가능, 공유 가능한 URL
- 복수 태그 AND 조건: `{ AND: tags.map(t => ({ tags: { has: t } })) }` Prisma 쿼리
- `TagFilterBar`는 Client Component(URL 조작), `TagFilterSection`은 Server Component(데이터 페치)로 분리
- Rebit 피드(`getFeed`) 제거: 단일 소유자 블로그이므로 소셜 타임라인 불필요

## 검증 결과

- `pnpm typecheck`: 오류 없음
- `pnpm test:run`: 55개 테스트 전부 통과
- `/?tags=nextjs` → 역량 태그 바(#nextjs 활성 상태) + 해당 Bit만 표시 확인
- Bit에 탐구 줄기 배지 + AI 협업 배지 정상 렌더
