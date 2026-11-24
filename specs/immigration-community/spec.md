# Canada PR 커뮤니티·한국어 뉴스 주간 요약 — 2단계 (2a: CN드림)

## Meta
- 기획: `~/Obsidian/document/01_Projects/Job_Application_2026/Canada_PR_Monitor_Plan.md` 4-3, 5-3
- Approved by: 사용자 — "2부터 해줭"(2026-11-24), 출처 "둘 다"(CN드림 먼저, Reddit은 키 준비되면)

## Goal
공식 표(1단계)로는 안 보이는 정책 변화·현장 분위기를 한국어로 한 주에 한 번 받아 본다.

## Non-goals
- Reddit (2b — 공식 Data API 키가 필요, 사용자가 앱 등록 후)
- CN드림 자유게시판·묻고답하기 (영주권 카드 갱신 같은 생활 질문이 대부분이라 잡음이 크다)
- 기사 본문 저장·재게시 (요약과 링크만)
- 공개 화면 노출 (이 트랙은 항상 비공개)

## Research (2026-11-24, 정직한 UA)
- Reddit: robots.txt `User-agent: * / Disallow: /`, RSS 404·429 → 자동 수집 불가. 공식 API만 가능.
- CanadaVisa 포럼, Immitracker: robots `Disallow: /`(CanadaVisa는 Incapsula 봇 차단도) → 제외.
- CN드림(cndreams.com, 캘거리 한인 신문): robots는 `/images/`만 막음. `news/news_list.php?code1=5`가 "이민" 섹션 — 목록에 제목·요약·"기사 등록일: yyyy-mm-dd", 기사 본문은 `#news_content_id`. 2주에 2~3건 꼴. 본문에 `select-none`(복사 방지)이 있어 원문은 저장·게시하지 않는다.

## Decisions
- **D1 출처**: CN드림 이민 뉴스 목록 1페이지만. 기사 페이지는 새 기사만, 한 번에 최대 8건.
- **D2 주기**: 주 1번, 월요일 01:00 UTC. 별도 워크플로 `immigration-weekly.yml` (Claude CLI 인증은 curate와 같은 방식).
- **D3 중복**: 스키마 추가 없이 `PageSnapshot`에 키 `community:cndreams`로 이미 본 기사 번호(idx) 목록을 JSON으로 저장(최근 300개). 첫 실행은 등록일 기준 최근 14일 기사만(첫 요약이 비지 않게) 요약하고 나머지는 "본 것"으로 표시.
- **D4 AI**: 새 기사 제목+본문(기사당 3,000자까지)을 Sonnet에 한 번에 넘겨 기사별 한국어 요약 2~3줄 + 관련도(high/low)를 받는다. 관련도 기준은 "BC·알버타에서 일하는 소프트웨어 개발자가 영주권을 받는 데 영향이 있나". **개인 정보(점수·경력 등)는 프롬프트에 넣지 않는다.** 기사 본문은 비신뢰 블록 안에 넣는다(news-ai와 같은 인젝션 방어).
- **D5 결과**: 비공개 Thread "Canada PR weekly"에 비공개 Bit(#immigration). 머리 Bit 1개("CN드림 이민 뉴스 — 2026-11-17 ~ 11-23, 3건 (관련 높음 1)") + 기사마다 Bit 1개(관련 높음 먼저, ★ 표시, 요약, 원문 링크). 새 기사가 없으면 "이번 주 새 기사 없음" 머리 Bit만 — 2주 연속 나오는지 확인할 수 있게(plan 6장 완료 기준).
- **D6 실패**: 목록을 못 읽으면 exit 1. 목록은 읽었는데 기사 0개 파싱(구조 변경 의심) → 경고 Bit. AI가 실패하면 요약 없이 제목·링크만 남긴다(놓치지 않게). 알림을 남긴 뒤에 "본 것"을 저장한다.

## Constraints
- 사이트 차단 우회 금지, 정직한 UA. 기사 사이 1초 쉰다.
- 저장소(공개)에 실제 기사 문구를 넣지 않는다 — 픽스처는 구조만 남기고 문장은 지어낸 것.

## Requirements
- R1 파서: (G) 목록 픽스처 (W) 파싱 (T) 이민 섹션 기사만 idx·제목·등록일·URL로, 다른 섹션 링크는 무시. 기사 픽스처 → 본문 텍스트(스크립트 제외).
- R2 주간 실행: (G) 본 기사 없음 (W) 첫 실행 (T) 14일 안 기사만 요약, 나머지 본 것. 다시 실행 → 새 Bit 없음 대신 "새 기사 없음" 1개.
- R3 AI 실패: (G) AI가 null (W) 실행 (T) 제목·링크 Bit는 남는다.
- R4 순서: (G) postNote 실패 (W) 실행 (T) 본 것 저장 안 됨.

## Tasks
- T1 `src/lib/immigration/community.ts`(파서 + `runCommunityDigest`) + 픽스처 + 테스트 — R1~R4
- T2 `src/lib/immigration/community-ai.ts` (news-ai의 클라이언트·callJson 재사용) — D4
- T3 store: `postNote`에 Thread 제목 인자 — D5
- T4 `scripts/immigration-weekly.ts`(+`--dry-run`), `.github/workflows/immigration-weekly.yml` — D2
