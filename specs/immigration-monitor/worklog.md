# Canada PR draw monitor 1단계 — worklog (2026-11-22)

- 사용자 "스키마 승인" → 운영 `db push`: `immigration_draws`, `page_snapshots` 추가만(migrate diff로 CREATE만 확인). 두 테이블 RLS 켬, Prisma 소유자 연결로 읽기·쓰기 확인.
- 설계 중 비공개 노출 버그 발견 → PR #38로 먼저 수정·머지(사용자 승인). 운영 공개 Thread 83 → 42.
- 실제 페이지 dry-run: EE 454, BC PNP 44, AAIP 99. 운영 실행은 아직 안 함 — 이 PR 머지 뒤 Actions에서 첫 실행(과거 기록 저장 + "started tracking" 3건).

## Gemini 리뷰 (gemini-diff-review.md, 두 번째 시도 — 첫 번째는 8분 타임아웃)
- #1 비공개 Thread 노출 → #38에서 이미 해결.
- #2 머리 이름 바뀌면 빈 값 저장 → 필요한 열을 못 찾으면 표를 못 읽은 것으로.
- #3 rowspan: 짧은 줄 뒤 열 어긋남 → 줄 끝에서 남은 rowspan 모두 처리. rowspan이 틀려 밀린 줄 → 스트림 칸이 날짜거나 점수·인원 칸이 긴 글이면 버림. ("Less than 10" 7건이 처음엔 잘못 걸러져서 완화)
- #4 키 → EE 회차 번호, PNP는 점수·인원 포함.
- #5 긴 선발 조건 → 90자로 잘라 줄이 사라지지 않게, 머리 자르기 음수 방지.
- #6 저장 후 알림 실패 시 알림 영구 누락 → 알림 먼저, 저장 나중.
- #7 중첩 블록 중복 줄, 공지 속 #단어가 태그 10개 상한을 채움 → 잎 블록만, # → ＃.
- #8 "표를 못 읽음" 경고 매일 반복 → 7일에 한 번.

## 검증
tsc, eslint, vitest 336, dry-run(실제 3곳). e2e `immigration.spec.ts`는 CI(DB 있음)에서.
