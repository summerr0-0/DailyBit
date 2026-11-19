# Spec: news-curation-v2

## Meta
- **Created**: 2026-11-19
- **Type**: dev
- **Status**: approved
- **Approved by**: user
- **Approved at**: 2026-11-19
- **Related**: `specs/news-curation/` (1단계, 운영 중), 원 기획서(뉴스 + 초보자 개념 사전), `gemini-spec-review.md`

## Goal
같은 사건을 다룬 기사들을 묶어 사건마다 Thread 초안 1건(종합 요약 + 출처별 Bit)을 만들고, 초보자 개념을 재사용 가능한 개념 Thread로 연결한다.

## Non-goals
- 마크다운 Note 모델 (Thread로 대체 — 사용자 결정 2026-11-19)
- 자동 발행 (항상 오너 컨펌)
- 새 소스 추가, 한국어 출력

## Confirmed Goal
수집 → 검토(채점 + 같은 사건 묶기) → 사건별 종합 작성 → 개념 연결 순서로 동작한다.
- 뉴스 초안 = Thread: Bit 1 종합 요약(여러 출처 통합), Bit 2..n 출처별 포인트 1줄 + URL (사건당 출처 최대 3)
- 개념: 사건당 초보자 개념 1~2개 추출 → 기존 개념 Thread가 있으면 링크, 없으면 개념 Thread 초안 생성(같은 개념 초안 중복 금지)
- 개념 링크는 발행된 개념 Thread로만 건다. 개념 초안이 미발행이면 링크 없이 두고, 발행 시점에 채운다
- 실행당 사건 최대 3건
- 완료 기준: GPT-6.2 같은 사건이 출처 2개를 단 Thread 초안 1건으로 나온다. 개념 링크는 발행된 개념 Thread로만, 같은 개념 초안이 두 번 생기지 않는다.

## Research
- 1단계 파이프라인: `runCuration` — 정리→수집→신선도→채점(roundRobin 60, 배치+청크 폴백, 전체 실패 시 ScoringUnavailableError)→`rankPool`→기사별 생성(소스당 1, Sonnet 3회 상한)→`createNewsDraft` (`src/lib/news-curate.ts`)
- 채점: `scoreItems(items)` 1회 호출, 모델엔 순번 id, json_schema `{scores:[{id,score}]}` (`src/lib/news-ai.ts`) — 같은 호출에 묶음 번호(cluster) 필드 추가 가능
- 생성: `generateNews({title, rawExtract, sourceName})` → `{headline, bullets, tags}`; 조립 `buildNewsBit` (≤500자, 코드가 URL·태그 조립, URL 제거, 금지어) (`src/lib/news-compose.ts`)
- AI 백엔드: `NEWS_AI_BACKEND=cli` → `claude -p --json-schema` (구독 토큰) (`src/lib/news-ai-cli.ts`)
- 초안: `ScrapDraft.segments` = 문자열 배열, 2개 이상이면 `publishDraft`가 `createThread(title)` + Bit들(aiCollab=LED) 생성 후 초안 삭제 (`src/lib/scrap-drafts.ts:193-205`). `suggestedThreadTitle` 필드 있음. `ScrapDraft.feedItemId @unique` — 초안 1개 = FeedItem 1개 (다중 출처엔 부족)
- Thread: `createThread(title ≤100)`, 공개 페이지 `/threads/[id]` (`src/lib/threads.ts`, `src/app/threads/[id]/page.tsx`)
- Bit 본문 링크: http(s) 절대 URL만 링크화 (`src/lib/linkify.ts`) → 개념 링크는 절대 URL 필요. 사이트 기준 URL 환경변수 없음 (운영: `https://daily-bit.vercel.app`)
- 태그: 본문 인라인 `#tag`를 `parseTags`로 추출 (`src/lib/tags.ts`)
- 인박스 UI: `NewsInbox` → 기존 `DraftCard` 재사용, segments 편집·삭제·Thread 제목 편집 지원 (`src/components/scrap/`)
- 운영 관찰(2026-11-19): 첫 실행 초안 3건 중 2건이 같은 사건(OpenAI 공지 + Simon Willison) (`specs/news-curation/worklog.md`)

## Decisions

### D1: 사건 묶기는 기존 채점 호출에서 함께 한다 (추가 호출 없음)
- **Status**: assumed
- **Rationale**: Haiku 채점 출력에 `event`(짧은 kebab 키, 예: `openai-gpt-6-2-release`)를 추가. 프롬프트에 **최근 7일 NewsEvent 전체**(열림·발행·폐기·만료 모두) `{eventKey, title}`를 넣어 같은 사건이면 기존 키를 재사용하게 한다 — 닫힌 사건도 보여줘야 늦은 기사가 새 키로 중복 초안을 만들지 않는다 [L2 리뷰 #1]. 같은 목록을 청크 폴백의 모든 청크에도 넣는다. 키는 코드가 정규화(소문자 kebab, 60자). 묶음은 정규화된 키 정확 일치로만 하고, 다른 키인데 제목이 많이 겹치면 `event_split_suspect` 로그 [#5]. 반려안: 제목 임베딩/유사도(의존성·튜닝 비용), 별도 묶기 호출(호출 수 증가).

### D2: 선정 단위 = 사건
- **Status**: assumed
- **Rationale**: 순서: ① 늦은 출처 처리(D8, 점수 6 이상, 사건 슬롯을 쓰지 않음) → ② 새 사건 선정 [#6]. 사건 점수 = 소속 기사 최고 점수(6 이상만). 사건 점수순 상위 3건, 사건당 출처는 점수순 최대 3개. 1단계의 "소스당 1건" 규칙은 사건 단위 선정으로 대체(같은 사이트의 서로 다른 사건은 허용). 본문 부족(no_content) 출처는 빼고, 출처가 0이 되면 사건을 건너뛰고 차순위 사건으로.

### D3: 뉴스 초안 = 항상 Thread (사용자 결정)
- **Status**: resolved
- **Rationale**: Bit 1 = 종합 요약(headline + 불릿 3~4 + 태그, 여러 출처 통합, URL 없음). Bit 2..n = 출처별 `Source: {소스명} — {이 출처만의 포인트 1줄}` + 정리된 URL. 출처 1개여도 Thread. Thread 제목 = headline(≤100). 각 Bit ≤500자는 코드가 보장(요약 Bit는 불릿을 뒤에서부터 줄임, 출처 Bit는 포인트를 자름). 반려안: 단일 출처는 단일 Bit(형식 불일치).

### D4: 종합 작성 = 사건당 Sonnet 1회
- **Status**: assumed
- **Rationale**: 입력 = 출처별 본문(각 최대 6,000자, 구분자로 감싼 신뢰 불가 데이터). 출력 = `{headline, bullets[3-4], sources:[{index, point}], tags[1-3], concepts:[{term, aliases[]}] (0-2)}`. 조립·URL·태그 정제·금지어·숫자 검사는 1단계 compose 규칙 재사용(숫자 검사는 모든 출처 본문 합본 기준). 개념 추출을 같은 호출에서 해 추가 비용 없음.

### D5: 개념 = Concept 레코드 + 개념 Thread
- **Status**: assumed
- **Rationale**: `Concept { slug @unique, term, aliases[], status(PENDING|PUBLISHED|REJECTED), threadId?, draftId?, createdAt }`. 매칭은 slug·aliases 정규화(소문자, 공백·하이픈 제거) 정확 일치 + 작성 프롬프트에 기존 개념 term 목록을 줘 재사용 유도. 없으면 Concept(PENDING) 생성 + 개념 초안 생성. 초안 재생성 규칙(단 하나): **status=PENDING이고 draftId가 없을 때만** 초안을 다시 만든다. PUBLISHED는 링크만, REJECTED는 무시. 초안 만료·발행 시 draftId를 비운다 [#3]. 실행당 개념 초안 상한(2)을 넘는 개념은 Concept 행도 만들지 않는다(다음에 다시 등장하면 그때 처리) [#3].

### D6: 개념 Thread 형식 = Bit 3개 (사용자 결정)
- **Status**: resolved
- **Rationale**: ① `What is {term}?` 한 줄 정의 + 일상 비유 ② 왜 쓰나(장점·한계) ③ `Related news: {뉴스 제목}` + 뉴스 Thread 링크 — 개념 발행 시점에 `Concept.firstEventKey`의 NewsEvent.threadId로 채우고, 미발행이면 이 Bit 생략 [#2]. 개념 초안 생성은 Sonnet 1회, 실행당 최대 2건. 영어, 1단계 톤 규칙(과장 금지).

### D7: 개념 링크는 발행 시점에 해결
- **Status**: resolved
- **Rationale**: 뉴스 초안은 `conceptSlugs`만 저장하고 개념 Bit는 segments에 넣지 않는다. 뉴스 발행 시 `Concept.threadId`가 있는 개념만 마지막 Bit `New to this? {term} → {SITE_URL}/threads/{id}`로 추가(없으면 생략). 개념 초안 발행 시 `Concept.threadId` 저장, 관련 뉴스가 이미 발행됐으면 ③ Bit에 링크하고, **이미 발행된 그 뉴스 Thread 끝에 `New to this? {term} → 링크` Bit를 추가**한다(오너의 개념 발행 행동이 트리거, 다른 기존 글은 건드리지 않음) [#2]. 관련 뉴스는 NewsEvent.threadId로 찾는다. 인박스 카드에 "개념: Quantization (초안 대기)" 표시. `SITE_URL` = `NEXT_PUBLIC_SITE_URL ?? "https://daily-bit.vercel.app"` (linkify는 절대 http(s) URL만 링크화).

### D8: 늦게 온 출처 = 미발행 초안에 출처 Bit 추가 (사용자 결정)
- **Status**: resolved
- **Rationale**: 새 기사(점수 6 이상)의 event가 OPEN NewsEvent와 같으면, 그 사건의 출처 수(**FeedItem 기준**, segments 아님)가 3 미만일 때 Haiku 1회로 포인트 1줄을 만들어 출처 Bit를 **segments 맨 끝에** 덧붙이고 warning `source_added_later`. PUBLISHED/DISCARDED/EXPIRED 사건이면 SKIPPED(`event_closed`), 출처 3개면 SKIPPED(`event_full`). 실행당 최대 3회, 사건 슬롯 미사용 [#4, #6].
- **편집 충돌**: 초안을 고칠 때마다 `ScrapDraft.updatedAt`이 바뀐다. 인박스에서 발행·저장할 때 화면이 받은 `updatedAt`을 함께 보내고, 서버 값과 다르면 409로 거부 → 카드가 "새 출처가 추가됐어요, 다시 불러오세요"를 보여주고 새로고침 [#4].

### D9: 데이터 변경 — NewsEvent가 사건 상태의 단일 출처
- **Status**: assumed
- **Rationale**: `NewsEvent { id, eventKey @unique, title, status(OPEN|PUBLISHED|DISCARDED|EXPIRED), draftId? @unique, threadId?, createdAt, updatedAt }` 신설 — 열린/닫힌 사건 판정(#1), 발행된 뉴스 Thread 기록(#2), 같은 eventKey 열린 초안 2개 방지(eventKey unique, #7)를 한 테이블이 맡는다. `FeedItem.eventKey String?`. `ScrapDraft`: `DraftKind`에 `CONCEPT`, `conceptSlugs String[]`, `conceptId String?`. `Concept { id, slug @unique, term, aliases[], status, threadId?, draftId?, firstEventKey?, createdAt }`.
- 사건 초안 저장은 **한 트랜잭션**: NewsEvent(OPEN, draftId) + ScrapDraft + 출처 FeedItem들 DRAFTED·eventKey [#7].
- v1 초안(eventKey 없음)은 사건 매칭에서 제외하고 기존 방식대로 발행 [#7]. 모두 추가 전용.

### D12: 종류별 발행·폐기 훅
- **Status**: assumed
- **Rationale**: `publishDraft`/`deleteDraft`가 kind별로 분기 [#8].
  - NEWS 발행 → NewsEvent=PUBLISHED, threadId 저장, 발행된 개념 링크 Bit 추가(D7)
  - NEWS 폐기 → NewsEvent=DISCARDED, 관련 Concept는 그대로
  - CONCEPT 발행 → Concept=PUBLISHED, threadId 저장, draftId 비움, 관련 뉴스 백링크(D7)
  - CONCEPT 폐기 → Concept=REJECTED, draftId 비움
  - 만료(cron) → NEWS: NewsEvent=EXPIRED / CONCEPT: Concept는 PENDING 유지, draftId 비움

### D10: 보관·폐기
- **Status**: assumed
- **Rationale**: NEWS 초안 3일 만료 유지. CONCEPT 초안 7일 만료(개념은 덜 급함) — 만료 시 Concept는 PENDING에서 초안 없음 상태로 남고 다음에 다시 등장하면 재생성 가능. 오너가 개념 초안을 Discard하면 Concept=REJECTED(다시 제안 안 함) — 훅은 D12.

### D11: 비용 상한 (실행당, 구독 사용량)
- **Status**: assumed
- **Rationale**: Haiku 채점·묶기 1회(실패 시 청크) + Sonnet 사건 작성 ≤3 + Sonnet 개념 ≤2 + Haiku 늦은 출처 ≤3. 하루 2회.
- 상한은 **시도(호출) 수** 기준. 사건 작성이 실패하면 그 사건 출처들은 FAILED(1단계 재시도 규칙)이고 슬롯은 소모됨 — 다음 사건이 대신 들어오지 않음(비용 예측 가능). 본문 부족으로 모델을 안 부른 사건만 슬롯을 쓰지 않음. 개념 작성 실패 → Concept는 PENDING·draftId 없음으로 남아 다음 등장 때 재시도 [#9].

### D13: 검증은 픽스처로
- **Status**: assumed
- **Rationale**: 완료 기준을 운영 데이터에 의존하지 않게 [#10]: (a) 출처 2개 같은 사건 → Thread 초안 1건, (b) 개념 먼저 발행 → 뉴스 발행 시 링크, (c) 뉴스 먼저 발행 → 개념 발행 시 백링크 Bit 추가, (d) 같은 개념 두 실행 연속 → 초안 1건, (e) 닫힌 사건의 늦은 기사 → event_closed, (f) 인박스 열린 상태에서 출처 추가 → 발행 409.

### D14: Gemini 스펙 리뷰 반영 (2026-11-19, 10건 전부) — 위 결정보다 우선
1. **ScrapDraft.eventKey**(nullable, index) 추가. `feedItemId`는 v1 전용으로 남고 v2 NEWS·CONCEPT 초안은 null.
2. **실행 중 새 사건의 청크 분리**: 청크는 순서대로 돌리며, 앞 청크에서 새로 나온 eventKey·제목을 뒤 청크 프롬프트의 사건 목록에 누적해 넣는다.
3. **개념 ↔ 사건은 다대다**: `Concept.firstEventKey` 대신 `ConceptEvent { conceptId, eventKey, @@unique }`. 개념 발행 시 연결된 PUBLISHED 사건 전부(최대 3)에 백링크 Bit를 붙이고, 개념 Thread ③ Bit는 그 사건들 제목·링크를 나열. 뉴스가 나중에 발행되면 R6.1 경로로 링크.
4. **cron 쪽 낙관적 잠금**: 늦은 출처 추가는 `UPDATE ... WHERE id=? AND updatedAt=?(읽은 값)`. 영향 0행이면 이번 실행은 건너뜀(FeedItem은 CANDIDATE 유지, 다음 실행 재시도). 인박스에는 별도 "저장" 없이 발행 시에만 서버로 보내므로 버전 검사는 발행에만 필요, 폐기는 검사 없음.
5. **conceptSlugs 정합성**: 상한 초과로 Concept 행을 안 만든 slug는 뉴스 초안 conceptSlugs에서 제외. 개념 작성 실패 slug는 남기되 카드에 "Concept: X (draft not created — will retry)" 표시.
6. **늦은 출처 세부**: 점수순 처리. 본문 부족 → SKIPPED(no_content), 상한 미차감. Haiku 실패 → FAILED(attempts 규칙), 상한 차감. 포인트에 1단계 compose 규칙(URL 제거·금지어·500자) 적용. 요약 Bit는 갱신하지 않음 — `source_added_later` 경고로 오너가 요약을 확인하도록.
7. **사건 키 충돌을 작성 전에 확인**: 선정된 사건의 키가 이미 NewsEvent에 있으면 Sonnet을 부르지 않는다 — OPEN이면 늦은 출처 경로로 합치고, 닫혔으면 SKIPPED(event_closed). 트랜잭션 단계 충돌(경합)은 같은 처리 후 로그. CANDIDATE로 남겨 반복 소모하는 경로 없음.
8. **개념 링크 Bit 형식 통일**: 개념 1개당 Bit 1개 (`New to this? {term} → 링크`). 뉴스 발행 시점이든 개념 발행 시점이든 같은 모양.
9. **만료 기준 = updatedAt**(cron이 출처를 붙이면 연장; 오너 편집은 서버에 저장되지 않으므로 영향 없음, v1 초안은 갱신이 없어 동작 동일). 만료 삭제와 NewsEvent/Concept 상태 갱신은 한 트랜잭션. 초안 삭제 경로는 `deleteDraft` 하나로 통일(API·cron 모두).
10. **실행 시간**: 사건 단위로 커밋하므로 중간에 끊겨도 완료된 사건은 유지되고 나머지는 다음 실행에서 이어짐. 워크플로 `timeout-minutes` 15 → 30.

## Constraints
- 자동 발행 금지, LLM은 URL을 쓰지 않음(링크는 코드가 조립), 각 Bit ≤500자
- 1단계 동작(전체 채점 실패 시 exit 1, 30일 보관, 토큰 정리, 오너 전용 /scrap) 유지
- 스키마 변경은 추가 전용, 운영 DB 반영은 머지 전에 별도로(머지와 같은 배치 금지)
- next/* 금지 모듈 규칙 유지 (cron 스크립트 호환)

## Known Gaps
- event 키 품질은 모델 의존 — 운영 1주 후 같은 사건 분리/다른 사건 병합 사례 점검
- 개념 "초보자 기준"은 모델 판단 — 너무 쉬운/어려운 개념이 나오면 프롬프트 조정

## Requirements

### R0: 사건별 Thread 초안 (Confirmed Goal, D13a)

#### R0.1: 같은 사건 출처 2개 → Thread 초안 1건
- **Given**: 픽스처 — OpenAI·Simon Willison 기사 2건, 채점 결과 같은 event `openai-gpt-6-2`, 점수 9·8
- **When**: `runCuration`
- **Then**: NEWS 초안 1건, segments = [요약 Bit, `Source: OpenAI News — …` + URL, `Source: Simon Willison — …` + URL], suggestedThreadTitle = headline, NewsEvent(OPEN, draftId) 1행, 두 FeedItem 모두 DRAFTED·eventKey 설정

### R1: 채점 + 사건 묶기 (D1)

#### R1.1: 채점 출력에 event 포함
- **Given**: 신규 기사 4건과 최근 7일 NewsEvent 2건(OPEN 1, PUBLISHED 1)
- **When**: `scoreItems`
- **Then**: 호출 1회, 프롬프트에 두 NewsEvent의 eventKey·title이 들어가고, 결과가 기사별 `{score, event}`로 반환된다

#### R1.2: 키 정규화
- **Given**: 모델 event `OpenAI GPT_6.2 Release!!`
- **When**: 정규화
- **Then**: `openai-gpt-6-2-release` (소문자 kebab, 60자 이하)

#### R1.3: 청크 폴백에도 사건 목록 전달
- **Given**: 배치 채점 실패 → 청크 모드
- **When**: 각 청크 채점
- **Then**: 모든 청크 프롬프트에 같은 최근 사건 목록이 들어간다

#### R1.4: 분리 의심 로그
- **Given**: 서로 다른 키 2개, 제목 단어 70% 이상 겹침
- **When**: 묶기
- **Then**: 키 기준으로 따로 두고 `event_split_suspect a b` 로그를 남긴다

### R2: 선정 (D2, D11)

#### R2.1: 사건 점수·상한
- **Given**: 사건 5개(최고 점수 9,8,7,7,5), 사건 A에 출처 4개
- **When**: 선정
- **Then**: 6 이상 사건 중 상위 3개, A는 점수순 출처 3개만 사용, 점수 5 사건은 제외

#### R2.2: 본문 부족 출처 제외
- **Given**: 사건 A 출처 2개 중 1개 no_content
- **When**: 본문 단계
- **Then**: 그 FeedItem은 SKIPPED(no_content), 나머지 1개로 Thread 초안 작성

#### R2.3: 모든 출처 본문 부족 → 다음 사건
- **Given**: 사건 A 출처 전부 no_content, 후보 사건 4개
- **When**: 선정
- **Then**: A는 모델 호출 없이 건너뛰고 4번째 사건이 슬롯을 받는다

#### R2.4: 작성 실패는 슬롯 소모
- **Given**: 사건 A 작성(Sonnet) 실패
- **When**: 생성 단계
- **Then**: A의 출처 FeedItem은 FAILED(attempts+1), 이번 실행의 사건 작성 시도는 3회를 넘지 않는다

### R3: 종합 작성·조립 (D3, D4)

#### R3.1: 구조화 출력 → segments 조립
- **Given**: Sonnet `{headline, bullets[4], sources:[{index:0,point},{index:1,point}], tags, concepts:[]}`
- **When**: `buildNewsThread`
- **Then**: 요약 Bit(URL 없음, 태그 포함) + 출처 순서대로 `Source: {name} — {point}\n{cleanUrl}`; 모든 Bit ≤500자, LLM 출력 속 URL 제거

#### R3.2: 500자 처리
- **Given**: 요약 Bit 620자, 출처 point 600자
- **When**: 조립
- **Then**: 요약은 뒤 불릿부터 제거(2개 미만이면 사건 작성 실패), 출처 point는 단어 경계로 잘라 URL 줄 포함 ≤500자

#### R3.3: 단일 출처도 Thread
- **Given**: 출처 1개 사건
- **When**: 조립
- **Then**: segments 2개(요약 + 출처)

#### R3.4: 숫자·금지어 검사
- **Given**: 요약에 `40%`, 출처 본문 어디에도 40 없음
- **When**: 검사
- **Then**: warnings `number_not_in_source:40` (모든 출처 본문 합본 기준)

#### R3.5: 저장 원자성
- **Given**: 작성 성공
- **When**: 저장
- **Then**: 한 트랜잭션에서 NewsEvent(OPEN, draftId) + ScrapDraft(kind NEWS, eventKey, conceptSlugs) + 출처 FeedItem DRAFTED; 같은 eventKey의 NewsEvent가 이미 있으면 트랜잭션 실패 → 로그, 출처는 CANDIDATE 유지

### R4: 개념 추출·중복 방지 (D5, D10, D13d)

#### R4.1: 기존 개념 재사용
- **Given**: Concept `quantization`(PUBLISHED, aliases `["4-bit quantization"]`), 작성 출력 concepts `[{term:"4-bit Quantization"}]`
- **When**: 개념 처리
- **Then**: 새 Concept·초안 없음, 뉴스 conceptSlugs = `["quantization"]`

#### R4.2: 새 개념 → PENDING + 개념 초안
- **Given**: 일치 없는 개념 `prompt-injection`
- **When**: 개념 처리
- **Then**: Concept(PENDING, firstEventKey, draftId) + CONCEPT 초안(segments 2개: 정의+비유, 왜 쓰나 — 관련 뉴스 Bit는 발행 시점에 붙음)

#### R4.3: 같은 개념 두 실행 연속
- **Given**: R4.2 직후 다음 실행에서 같은 개념 추출
- **When**: 개념 처리
- **Then**: 초안 추가 생성 없음 (PENDING + draftId 있음)

#### R4.4: 재생성 조건
- **Given**: Concept PENDING, 초안 만료로 draftId 없음 / REJECTED / PUBLISHED
- **When**: 같은 개념 다시 추출
- **Then**: PENDING·draftId 없음일 때만 초안 재생성, REJECTED는 무시, PUBLISHED는 링크만

#### R4.5: 실행당 개념 초안 상한
- **Given**: 이번 실행 새 개념 3개
- **When**: 개념 처리
- **Then**: 2개만 Concept·초안 생성, 세 번째는 Concept 행도 만들지 않음

#### R4.6: 개념 작성 실패
- **Given**: 개념 Sonnet 호출 실패
- **When**: 개념 처리
- **Then**: Concept PENDING·draftId 없음, 뉴스 초안은 정상 생성

### R5: 늦은 출처 (D8)

#### R5.1: 열린 사건에 출처 추가
- **Given**: OPEN NewsEvent `openai-gpt-6-2`(출처 FeedItem 1개), 새 기사 점수 8 같은 event
- **When**: 실행(선정 전 단계)
- **Then**: Haiku 1회로 point 생성, 출처 Bit를 segments 끝에 추가, warnings `source_added_later`, FeedItem DRAFTED·eventKey, 사건 슬롯 3개는 그대로

#### R5.2: 닫힌 사건 / 가득 찬 사건
- **Given**: PUBLISHED 사건과 같은 event의 새 기사 / 출처 3개인 OPEN 사건과 같은 event
- **When**: 실행
- **Then**: 각각 SKIPPED(`event_closed`) / SKIPPED(`event_full`), 새 초안 없음

#### R5.3: 실행당 상한
- **Given**: 늦은 출처 후보 5건
- **When**: 실행
- **Then**: 3건만 처리, 나머지는 CANDIDATE로 남아 다음 실행에서 처리

### R6: 발행·폐기 훅 (D7, D12)

#### R6.1: 개념 먼저 발행 → 뉴스 발행 시 링크
- **Given**: Concept PUBLISHED(threadId T1), NEWS 초안 conceptSlugs 포함
- **When**: 뉴스 발행
- **Then**: Thread 끝 Bit `New to this? {term} → {SITE_URL}/threads/T1`, NewsEvent PUBLISHED·threadId 저장

#### R6.2: 뉴스 먼저 발행 → 개념 발행 시 양방향 링크
- **Given**: NewsEvent PUBLISHED(threadId N1), CONCEPT 초안 firstEventKey=그 사건
- **When**: 개념 발행
- **Then**: 개념 Thread에 `Related news: {title}` + N1 링크 Bit, 뉴스 Thread N1 끝에 `New to this? {term} → 개념 링크` Bit 추가, Concept PUBLISHED·threadId·draftId 비움

#### R6.3: 미발행 개념은 링크 없음
- **Given**: Concept PENDING
- **When**: 뉴스 발행
- **Then**: 개념 링크 Bit 없음

#### R6.4: 폐기
- **Given**: NEWS 초안 / CONCEPT 초안
- **When**: Discard
- **Then**: NewsEvent DISCARDED / Concept REJECTED·draftId 비움

#### R6.5: 만료
- **Given**: 3일 지난 NEWS 초안 / 7일 지난 CONCEPT 초안
- **When**: cron 정리
- **Then**: NewsEvent EXPIRED / Concept PENDING 유지·draftId 비움

### R7: 편집 충돌 (D8)

#### R7.1: 발행 시 버전 확인
- **Given**: 인박스가 updatedAt U1으로 카드 표시, 그 사이 cron이 출처 추가(U2)
- **When**: 오너가 Publish(U1 전송)
- **Then**: 409, 발행 안 됨, 카드에 "새 출처가 추가됐어요 — 다시 불러오세요"와 새로고침 버튼

#### R7.2: 정상 발행
- **Given**: 전송 updatedAt = 서버 값
- **When**: Publish
- **Then**: 발행 성공

### R8: 인박스 UI

#### R8.1: 뉴스 카드
- **Given**: NEWS 초안(출처 2, conceptSlugs 1개 PENDING)
- **When**: /scrap
- **Then**: 카드에 사건 제목·출처 수·"Concept: prompt injection (draft pending)"·경고 배지, 기존 Thread 편집 UI(세그먼트 편집·삭제·제목)

#### R8.2: 개념 카드
- **Given**: CONCEPT 초안
- **When**: /scrap
- **Then**: News inbox 안 "Concepts" 묶음에 카드, 남은 보관(7일) 표시, 발행 시 R6.2 동작

### R9: v1 호환·스키마

#### R9.1: v1 초안 그대로 동작
- **Given**: eventKey 없는 v1 NEWS 초안(단일 Bit)
- **When**: 발행/폐기/만료
- **Then**: 1단계와 동일하게 동작, NewsEvent·Concept 훅 없음, 사건 매칭 대상 아님

#### R9.2: 추가 전용 스키마
- **Given**: 운영 DB
- **When**: 스키마 diff
- **Then**: CREATE/ADD/인덱스만, DROP·컬럼 타입 변경 없음

## Tasks

### T1: 스키마 — NewsEvent, Concept, 필드 추가 [infra]
- **Fulfills**: R9.2 (+ R3.5·R4·R6의 저장 기반)
- **Depends on**: (none)
- **Files**: `prisma/schema.prisma`(NewsEvent, NewsEventStatus, Concept, ConceptStatus, DraftKind.CONCEPT, FeedItem.eventKey, ScrapDraft.conceptSlugs·conceptId)

### T2: news-ai — 채점+사건, 사건 종합 작성, 개념 작성, 늦은 출처 포인트 [internal service]
- **Fulfills**: R1.1, R1.2, R1.3(프롬프트 부분), R1.4(순수 함수), R3.1(모델 호출 부분), R4.2(개념 생성 호출), R5.1(포인트 호출)
- **Depends on**: (none) ← T1·T3·T4와 병렬
- **Files**: `src/lib/news-ai.ts`, `src/lib/news-events.ts`(정규화·분리 의심, 순수), 테스트

### T3: news-compose — Thread 조립 [internal service]
- **Fulfills**: R3.1(조립), R3.2, R3.3, R3.4
- **Depends on**: (none) ← 병렬
- **Files**: `src/lib/news-compose.ts`(buildNewsThread, buildConceptThread, buildSourceBit), 테스트

### T4: 발행·폐기·만료 훅 + 버전 확인 [vertical, API]
- **Fulfills**: R6.1, R6.2, R6.3, R6.4, R6.5, R7.1(서버), R7.2, R9.1
- **Depends on**: T1
- **Files**: `src/lib/scrap-drafts.ts`(kind별 publish/delete/expire, appendBitsToThread, updatedAt 검사, createEventDraft 트랜잭션), `src/lib/site-url.ts`, `src/app/api/scrap/drafts/[id]/**`, 테스트(DB 없이 훅 로직은 순수 함수로 분리해 테스트)

### T5: 오케스트레이터 v2 [vertical, pipeline]
- **Fulfills**: R0.1, R1.3, R2.1, R2.2, R2.3, R2.4, R3.5, R4.1, R4.3, R4.4, R4.5, R4.6, R5.1, R5.2, R5.3
- **Depends on**: T1, T2, T3, T4(createEventDraft)
- **Files**: `src/lib/news-curate.ts`, `src/lib/news-curate-store.ts`, `scripts/curate.ts`(dry-run 픽스처: 같은 사건 2출처), 테스트(D13 a·d·e 픽스처)

### T6: 인박스 UI [vertical, UI]
- **Fulfills**: R8.1, R8.2, R7.1(화면)
- **Depends on**: T4
- **Files**: `src/components/scrap/NewsInbox.tsx`, `ScrapWorkbench.tsx`(DraftCard에 updatedAt 전송·409 처리), `src/app/scrap/page.tsx`, e2e(사건 Thread 발행 → 개념 링크)

PR은 하나(기능 단위 1개, 개념·사건이 발행 훅을 공유). T2·T3·T4는 서로 파일이 겹치지 않아 병렬.

## External Dependencies

### Pre-work
- (none) — 1단계 인프라(secrets, 워크플로) 그대로 사용

### Pre-merge
- 운영 DB에 추가 전용 SQL 적용(`migrate diff` 검토 → `db execute`) — **머지와 별도 단계로, 결과 확인 후 머지**

### Post-work
- workflow_dispatch 1회 → 사건 Thread 초안·개념 초안 확인
- 1주 운영 후 event 키 품질(분리/병합 사례)·개념 난이도 점검 (Known Gaps)
- 선택: Vercel에 `NEXT_PUBLIC_SITE_URL` 설정(기본값 `https://daily-bit.vercel.app`)
