# Canada PR 뉴스 — 1b단계 (IRCC·CIC News)

## Meta
- 기획: `~/Obsidian/document/01_Projects/Job_Application_2026/Canada_PR_Monitor_Plan.md` 2장(우선 1·2), 4-2
- Approved by: 사용자 — "2번 먼저"(2026-11-24: Reddit은 미루고 1b 먼저)
- 2a(PR #42) 위에 쌓은 브랜치. 2a의 요약 AI·저장소·스크립트를 같이 쓴다.

## Goal
선발 표로는 안 보이는 **정책 변화**(Express Entry 카테고리, PNP 규칙, 이민 수준 계획)를 하루 안에 한국어로 받는다.

## Research (2026-11-24, 정직한 UA)
- IRCC 보도자료: `api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&...&format=atom` 200, 20건. 날짜는 `<updated>`만(기존 parseFeed는 `published`만 읽어 날짜 없음 → 날짜에 의존하지 않게 설계).
- CIC News: `cicnews.com/feed` RSS 200, 10건, 하루 3~5건. robots.txt 404(제한 없음). 요약 ~470자.
- canada.ca robots는 CRA 일부 폴더만 막음.

## Decisions
- **D1 본문**: RSS/Atom의 요약만 쓴다. 기사 페이지는 열지 않는다(부담·저작권 최소).
- **D2 주기**: 매일 01:30 UTC(선발 모니터 01:00 다음). 2a와 한 워크플로 `immigration-news.yml`, 월요일엔 CN드림 주간 요약도.
- **D3 걸러내기**: 2a와 같은 Sonnet 호출(기사별 한국어 요약 + 관련도). **관련 있는 글만** 비공개 Bit로 남기고 나머지는 조용히 본 것으로. 일상적인 선발 결과 기사("X주 N명 초청")는 1단계 표와 겹치므로 관련 없음(테크 대상·새 카테고리면 예외) — 프롬프트에 추가.
- **D4 결과**: 비공개 Thread "Canada PR news", `★ [출처] 제목 / 요약 / 링크 / #immigration`, 500자 안(링크·태그 먼저 확보).
- **D5 중복**: PageSnapshot `news:ircc`, `news:cicnews`에 정규화 URL 목록(최근 300). 첫 실행은 출처마다 최신 3개만 보고 나머지는 본 것. 한 번에 최대 15건, 넘치면 다음 날.
- **D6 실패**: 피드 하나 실패 → 다른 피드는 처리하고 exit 1. AI 실패 → 아무것도 본 것으로 저장하지 않고 exit 1(다음 날 다시).

## Requirements
- R1 (G) 첫 실행 (W) 실행 (T) 출처당 최신 3개만 AI에, 관련 글만 Bit, 나머지는 본 것.
- R2 (G) 같은 피드로 두 번째 실행 (T) AI 호출·Bit 없음.
- R3 (G) AI 실패 (T) 본 것 저장 안 함.
- R4 (G) 피드 하나 503 (T) 다른 피드는 처리, error 보고.
- R5 (G) 아주 긴 제목·요약 (T) 500자 안, 링크와 #immigration 유지, 제목의 # 전각.

## Tasks
- T1 `src/lib/immigration/news-digest.ts` + 테스트 — R1~R5
- T2 `community-ai.ts` 프롬프트: 영어 기사도, 일상 선발 결과는 관련 없음 — D3
- T3 `scripts/immigration-news.ts`(2a 스크립트를 합침, `--weekly`), 워크플로 이름 변경 — D2
