# /immigration 500 수정 — worklog (2026-11-24)

## 증상
- 운영 `irin-j.com/immigration`이 방문자·오너 모두 500 (방문자는 404여야 함).
- 로컬 dev·`next build && next start`에서는 정상 404 → Vercel 환경에서만 실패.
- 같은 jsdom을 쓰는 `/api/scrap/extract`도 인증 없는 요청에 401이 아니라 500 → 모듈 로드(import) 단계에서 jsdom이 실패하는 것으로 판단.
- Vercel 로그는 CLI 로그인이 없어 직접 확인 못 함.

## 원인 (추정, 근거 위)
- 화면 → `store.ts` → `monitor.ts` → `parse.ts` → `jsdom` 으로 이어져, 화면이 쓰지도 않는 jsdom을 서버 함수가 로드했다.

## 수정
- jsdom 없이 쓰는 정의(Program, Draw, SOURCES, WATCHED_PAGES, drawKey, isTechRelevant, NOTE_TAG, NOTE_THREAD_TITLE)를 `sources.ts`로 분리. `parse.ts`는 `export *`로 그대로 내보내 기존 import 호환.
- `store.ts`는 monitor를 type import만, 상수는 sources에서. 화면도 sources에서.
- 회귀 방지 테스트 `no-jsdom.test.ts`: 화면·store·sources가 parse/monitor/jsdom을 런타임 import하지 않는지.

## 범위 밖
- `/api/scrap/extract`의 jsdom 500 자체 (원인 확정에 Vercel 로그 필요). 크론 스크립트는 GitHub Actions에서 돌아 영향 없음(오늘 실행 성공).

## 검증
- tsc, eslint, vitest 339 통과.
