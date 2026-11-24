# 2단계(2a) 주간 요약 — worklog (2026-11-24)

## 조사
- Reddit: robots.txt `Disallow: /`(전체), RSS 404·429 → 공식 Data API(앱 등록)만 가능 → 2b로.
- CanadaVisa 포럼·Immitracker: robots `Disallow: /` → 제외.
- CN드림 자유게시판·묻고답하기: "영주권" 검색 결과 대부분 PR 카드 갱신 같은 생활 질문 → 제외.
- CN드림 "이민" 뉴스 섹션(code1=5): 정책 기사, 2주에 2~3건 → 채택.

## 구현
- `community.ts`: 목록 파서(이민 섹션만, idx·제목·등록일), 본문 추출(`#news_content_id`), `runCommunityDigest`.
- `community-ai.ts`: Sonnet 한 번 호출로 기사별 한국어 요약 + 관련도. news-ai의 `getClient`·`callJson` 재사용(export만 추가).
- store: 비공개 Bit 작성 함수를 Thread 제목별로 공유(`privateNotePoster`), 본 기사 번호는 PageSnapshot `community:cndreams`에 JSON — 스키마 변경 없음.
- `scripts/immigration-weekly.ts`, `.github/workflows/immigration-weekly.yml`(월 01:00 UTC, curate와 같은 CLI 토큰).
- 픽스처는 마크업 구조만, 문장은 지어냄(공개 저장소에 기사 원문을 넣지 않기 위해).

## 결정 변경
- 첫 실행 창 7일 → 14일. 실제 dry-run에서 최근 7일에 기사가 없어 첫 요약이 "없음"이었다.
- 상한(8건)에 걸려 못 다룬 기사는 "본 것"으로 두지 않고 다음 주로.

## 검증
- 실제 사이트 dry-run(로컬 Claude CLI): 목록 10건, 14일 안 2건 요약, 둘 다 "관련 낮음"(농어촌 파일럿, 저임금 LMIA) — 판단 타당.
- tsc, eslint, vitest 통과.

## Gemini 리뷰 반영 (gemini-review.md)
- #1 긴 제목·요약에서 링크·#immigration이 잘림 → `articleNote`가 꼬리(링크+태그)를 먼저 확보하고 제목(140자)·요약을 줄인다. 제목의 #도 전각.
- #2 본문 못 읽은 기사를 제목만으로 요약 → AI에 안 보내고 "(본문을 못 읽었어요)" + 링크.
- #3 등록일 없는 기사가 첫 실행에서 조용히 "본 것" → 첫 실행에 포함.
- #4 깨진 seen JSON이면 `[]` → `null`(첫 실행처럼 14일 창).
- #5 /immigration 하단 상태에 내부 기록 행(community:*, warning:*)이 보임 → `getSnapshots`를 WATCHED_PAGES로 제한. (warning:* 노출은 1단계부터 있던 문제)
- #6 응답 크기 확인 전 전체 버퍼링 — 1단계 스크립트와 같은 방식, 대상이 정부·신문 페이지 몇 개라 그대로 둠.
- 회귀 테스트 3개 추가.
