# 비공개 노출 수정 (2026-11-22)

## 발견
이민 비공개 트랙을 설계하다가 확인. 운영에서 재현됨 (비공개 Bit 본문의 단어 3/3이 방문자용 /threads/[id] HTML에 있었음).
- `/threads/[id]`: `getThread`가 private 필터 없이 모든 Bit를 반환 → 방문자가 비공개 Bit 본문을 읽을 수 있었다.
- `/threads`, `GET /api/threads`: 비공개 Bit만 있는 Thread(운영 40개)의 제목과 전체 Bit 수가 보였다.
- `GET /api/bits/by-date`(가든 칸 클릭): 비공개 Bit를 그대로 반환.
- `[[링크]]` 사전(`getLinkTargets`): 비공개 Thread 제목·id가 공개 Bit의 링크로 풀릴 수 있었다 (Gemini #1).

## 수정
- `getThreads(includePrivate)`, `getThread(id, includePrivate)`, `getBitsByDateKST(date, includePrivate)`, `getLinkTargets(includePrivate)` — 방문자는 공개 Bit만, 공개 Bit가 없는 Thread는 목록에서 빠지고 상세는 404.
- 호출부는 모두 `isLoggedIn()` 결과를 넘긴다. 백링크 계산은 키 찾기용으로 전체 사전을 쓰고 결과 Bit는 기존처럼 공개 여부로 거른다.
- e2e `private-thread.spec.ts`: 방문자/오너 각각 확인. KST 날짜는 DB에서 받아 자정 경계에 흔들리지 않게.

## Gemini 리뷰 (gemini-diff-review.md)
- #1 링크 사전 → 반영. #4 자정 경계 → 반영. 테스트 갭(별도 상수, 오너 확인) → 반영.
- #2 PrivateTag가 공개 Bit에 붙으면 태그 알약이 보임 → 기존 설계(비공개 태그는 태그 페이지·클라우드만 숨김). 이번 범위 밖, 사용자에게 보고.
- #3 가든 잔디·통계가 비공개 Bit도 센다 → 내용이 아니라 활동량. 공개 기준으로 바꿀지 사용자 결정 필요 — 보고.
- #5 빈 Thread가 방문자에게 안 보임 → 의도대로.
