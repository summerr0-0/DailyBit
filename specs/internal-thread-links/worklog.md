# Worklog — 사이트 안 Thread 링크를 [[제목]]으로 (2026-11-24)

## 계기
사용자: 개념 Thread(`/threads/cmwvi4l5w000807l9uq8vq6of`)의 "Related news"가 [[ ]]가 아니라 테스트 서버 주소
`https://daily-bit.vercel.app/threads/…`로 떠 있음.

## 원인
- 개념 발행 때 붙는 "Related news"(와 "New to this?") Bit를 `threadUrl()` 절대 URL로 만들었고, `SITE_URL` 기본값이
  예전 주소 `daily-bit.vercel.app`이었다(Vercel에 `NEXT_PUBLIC_SITE_URL` 없음).
- 줄 라벨에 Thread 제목이 아니라 뉴스 사건(NewsEvent) 제목을 써서 Thread 제목과 다른 경우가 있었다.

## 바꾼 것
- `draft-hooks.ts` `threadLink()`: `[[Thread 제목]]`. 대괄호·`|`·100자 초과 제목, 또는 [[제목]]이 다른 Thread로 풀리면 URL.
- `scrap-drafts.ts`: 실제 Thread 제목 사용, `getLinkTargets`로 그 제목이 정말 그 Thread로 풀리는지 확인. 중복 확인은 경로(`/threads/id`, 도메인 무관) 또는 풀리는 [[제목]].
- `site-url.ts` 기본값 → `https://irin-j.com`.
- `scripts/fix-thread-links.ts` + `thread-link-fix.ts`: 이미 남은 Bit 고치기. 기본 미리보기, `--apply`일 때만 씀.
  화면과 같은 규칙(오너·방문자 사전)으로 풀리는 것만 [[ ]], 나머지는 주소만 운영 도메인으로, 500자 넘으면 주소만.
- 미리보기(운영 DB 읽기만): 23개 Bit, 23개 모두 [[제목]]으로 바뀜.

## Gemini 4건 반영
1. 마이그레이션 모호성 검사가 화면 규칙(대소문자·개념 이름 우선·방문자 사전)과 달랐음 → `getLinkTargets`로 확인
2. 줄 정규식이 앞 글을 지움 → 줄 시작 `- `/`New to this? `에 고정
3. 같은 제목·개념 이름과 겹치는 제목이면 [[ ]]가 엉뚱한 곳으로 → 확인 후 URL
4. 못 바꾸는 링크는 옛 도메인이 남음 / 500자 초과 → 주소만 운영 도메인으로

## 확인
tsc, eslint, vitest 389 통과.

## 남은 것
- 머지 후 운영 DB에 `--apply` (사용자 승인 따로).
