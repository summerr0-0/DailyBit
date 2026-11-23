# Canada PR draw monitor — 1단계

## Meta
- 기획: `~/Obsidian/document/01_Projects/Job_Application_2026/Canada_PR_Monitor_Plan.md` (A안 결정, 0단계 결과)
- Approved by: 사용자 — "A로 해줘"(2026-11-22), DB 스키마 "스키마 승인"(2026-11-22)

## Goal
BC·알버타에서 개발자로 영주권을 받는 길이 지금 열려 있는지 매일 판단할 수 있게, 공식 선발 결과를 표로 쌓고 새 선발·공지 변경을 비공개로 알린다.

## Non-goals
- IRCC 뉴스·CIC News RSS 채점 (1b단계), Reddit 주간 요약 (2단계), LMIA 스폰서 목록 (3단계)
- 내 점수(CRS 등)와 비교하는 자동 판단 — 판단은 사람이 표를 보고 한다
- 공개 화면 노출 (이 트랙은 항상 비공개)

## Research (0단계, 2026-11-22)
- EE: `canada.ca/.../ee_rounds_123_en.json` — `rounds[]` (drawDate, drawName, drawSize, drawCRS, drawText2). 454건.
- BC PNP: WelcomeBC invitations-to-apply, "ITA type" 표. 날짜·점수·인원이 rowspan으로 여러 줄에 걸친다. 44건.
- AAIP: alberta.ca aaip-processing-information Table 10 ("Draw date" 머리). rowspan 없음. 99건.
- AAIP 공지: aaip-updates — 표 없음, 본문 변경 감지 대상.
- 세 곳 모두 정직한 UA(`DailyBitFeedReader/1.0`)로 열린다.

## Decisions
- **D1 스키마**: `ImmigrationDraw`(program, stream, detail, drawDate, minScore, invitations, invitationsText, sourceUrl, dedupeKey unique), `PageSnapshot`(url PK, hash, text, checkedAt, changedAt). 추가만. 두 테이블은 RLS 켬(정책 없음 → Supabase REST로 못 읽음, Prisma 소유자 연결은 그대로).
- **D2 AI 없음**: 공식 표·JSON을 결정적으로 파싱. 기획의 "Haiku로 구조화"보다 정확하고 개인 정보가 프롬프트로 갈 일이 없다.
- **D3 중복 제거**: EE는 dedupeKey = sha256(EE|ref|회차 번호) — 문구가 바뀌어도 같은 회차. PNP는 sha256(program|date|stream|detail|점수|인원, 소문자) — 같은 날 같은 스트림의 다른 선발도 구분. BC의 rowspan으로 갈라진 같은 선발은 조건을 " / "로 합친다. Innovate의 시급 선발과 점수 선발은 따로 둔다.
- **D4 첫 실행**: 프로그램에 기록이 없으면 과거 선발을 조용히 넣고 "started tracking" 알림 1건만. 공지 페이지 첫 스냅샷은 알리지 않는다. "Last updated" 줄은 비교에서 뺀다.
- **D5 알림**: 비공개 Thread "Canada PR draws"에 `private: true` Bit, 태그 `#immigration`(비공개 태그로 등록). 프로그램별 1건, 500자 안, 넘치면 "(+N more)". 인박스 초안 대신 바로 비공개 Bit — 사실 기록이라 검토할 게 없고, 발행 경로가 없으니 실수로 공개될 일도 없다.
- **D6 ★ 표시**: 개발자 관련 선발 강조. EE는 선발 이름만(CEC, STEM, General, No Program Specified), PNP는 tech·technology·innovate·high economic impact·software·computer.
- **D7 실행**: GitHub Actions `immigration.yml` 하루 1번 01:00 UTC. 하나라도 못 읽으면 exit 1 (Actions 실패 메일). 표를 못 읽으면(0건) "layout may have changed" 알림.
- **D8 화면**: `/immigration` 오너 전용(방문자 404), 프로그램별 최근 40건, "★ only" 필터. /scrap에 링크.

## Constraints
- 비공개 Bit가 방문자에게 안 보여야 한다 → **PR #38(비공개 노출 수정)이 먼저 머지돼야** 이 PR의 워크플로가 돌아도 안전하다.
- 사이트 차단 우회(UA 위장 등) 금지. 공개 페이지·공개 데이터만.

## Requirements
- R1 파서: 세 출처를 Draw[]로. (G) 실제 페이지 픽스처 (W) 파싱 (T) 날짜·점수·인원·rowspan 합치기가 맞다. 모양이 다르면 빈 배열.
- R2 모니터: (G) 저장된 선발 (W) 같은 페이지로 다시 실행 (T) 추가·알림 0. 새 선발 1건 → 알림 1건, ★ 줄 먼저.
- R3 공지 변경: (G) 이전 스냅샷 (W) 본문 줄이 늘어남 (T) 새 줄만 알림.
- R4 화면: (G) 방문자 (W) /immigration (T) 404. 오너는 표와 ★ 필터.
- R5 실패: (G) 404·표 없음 (W) 실행 (T) 결과에 error, exit 1, 표 없음은 경고 알림 1건.

## Tasks
- T1 `src/lib/immigration/parse.ts` + 픽스처 + 테스트 — R1
- T2 `monitor.ts`(MonitorStore 인터페이스) + 테스트 — R2, R3, R5
- T3 `store.ts`(Prisma), 스키마, 운영 `db push` + RLS — D1
- T4 `scripts/immigration.ts`(+`--dry-run`), `.github/workflows/immigration.yml` — D7
- T5 `/immigration` 화면, /scrap 링크, e2e — R4
