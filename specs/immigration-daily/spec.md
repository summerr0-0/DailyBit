# Canada PR 알림 하루 1번 한 묶음

## Meta
- 기획: `~/Obsidian/document/01_Projects/Job_Application_2026/Canada_PR_Monitor_Plan.md` 5-5
- Approved by: 사용자 — "걍 비슷할때 돌면서 요약하면 안돼?" → 스레드 하나 + 실행 하나 제안에 "ㅇㅇㅇ 그렇게 해줘"(2026-11-24)

## Goal
선발 표·뉴스·CN드림 주간 요약을 매일 한 번(한국 10시 무렵), 한 곳에서 본다.

## Non-goals
- 각 단계의 판단 규칙(관련도, 첫 실행 창, 상한) 변경 — 그대로 둔다
- 이미 남은 옛 스레드("Canada PR draws" 등) 옮기기 — 운영 DB 데이터 변경이라 따로 묻는다

## Decisions
- **D1 실행**: 워크플로 `immigration.yml` 하나(01:00 UTC). 순서: 선발 표(AI 없음) → IRCC·CIC News(AI) → 월요일 CN드림(AI). `immigration-news.yml`·`scripts/immigration-news.ts`는 지운다.
- **D2 스레드**: 비공개 Thread "Canada PR" 하나(`NOTE_THREAD_TITLE`).
- **D3 머리 Bit**: 새 소식이나 실패가 있는 날만 "Canada PR — yyyy-mm-dd" 머리 Bit(단계별 한 줄)를 먼저 남기고 상세 Bit가 뒤따른다. 조용한 날은 Bit 없음(저장은 함). 표 구조 경고는 monitor가 주 1번으로 묶으므로 그것만으로는 머리 Bit를 만들지 않는다.
- **D4 순서 보장**: 각 단계의 알림·저장을 큐에 쌓고 머리 Bit 뒤에 쌓인 순서대로 실행 — "알림 뒤에 저장"이 그대로. 하나가 실패하면 거기서 멈춘다. 단계가 예외로 멈추면 그 단계가 쌓은 것은 버리고 머리 Bit에 "실행 실패".
- **D5 실패 격리**: AI 인증 확인 단계는 `continue-on-error` — 선발 알림은 항상 돈다. 인증이 실패했으면 마지막 단계에서 job을 실패로(메일).

## Requirements
- R1 머리 Bit가 맨 앞, 상세는 한 스레드, 저장은 각 알림 뒤 — `daily.test.ts`
- R2 AI 실패: 선발은 남고 저장됨, 뉴스 줄은 "AI 요약 실패", 뉴스 본 것은 저장 안 됨
- R3 조용한 날: Bit 없음, 본 것은 저장
- R4 읽기 실패는 조용한 날에도 머리 Bit
- R5 중간에 터진 단계의 큐는 버림 / 알림 실패 시 뒤 저장 없음
- R6 월요일 단계 실패는 머리 Bit에 표시, 다른 단계는 계속

## Tasks
- T1 `src/lib/immigration/daily.ts` + 테스트 — R1~R6
- T2 `scripts/immigration.ts`(`--weekly`, `--dry-run`), `.github/workflows/immigration.yml` 통합 — D1, D5
- T3 `sources.ts`/`store.ts` 스레드 제목 하나로 — D2
