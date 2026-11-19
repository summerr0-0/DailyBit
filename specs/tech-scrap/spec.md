# Spec: tech-scrap

## Meta
- **Created**: 2026-07-13
- **Type**: dev
- **Status**: approved
- **Approved by**: user
- **Approved at**: 2026-07-13

## Goal
테크 글 스크랩 기능 — Irin이 준 개발 글(URL/영상/텍스트)을 AI가 요약·정리해 발행 초안으로 만든다.

## Non-goals
- 트위터/링크드인 자동 스크랩 (Feature #2, 별도)
- 스크린샷 OCR 입력 (v2 후보)
- 방문자에게 노출되는 자동 발행 (초안은 항상 비공개, Irin 컨펌 후 발행)

## Confirmed Goal
Irin이 개발 글(기본 URL, 실패 시 텍스트/캡처 fallback, 유튜브는 자막)을 주면, AI가 충실한 요약 + 쉽고 간결한 보충 설명을 **영문**으로(과장된 비유 금지) 생성해 **비공개 draft**로 저장한다. Irin이 컨펌하면 Bit로 발행하며, 500자를 넘으면 주제가 관통하는 Thread로 분할한다. 성공 신호는 "이게 없었으면 기록 안 하고 넘어갔을" 글을 손쉽게 기록으로 남기는 것.

## Research
- Bit 모델에 **draft/status 필드 없음** — 가시성 플래그는 `pinned`, `private`(Boolean)뿐 (`prisma/schema.prisma:44-63`)
- `aiCollab` enum 이미 존재: `NONE | HINT | LED` — AI 작성 Bit 표시에 재사용 가능 (`prisma/schema.prisma:11-15`)
- Bit는 `content String @db.VarChar(500)`, `tags String[]`, `threadId String?`(nullable, onDelete SetNull) (`prisma/schema.prisma:44-63`)
- Tag는 별도 모델 아님 — `#해시태그`를 `parseTags(content)`로 파싱한 `String[]` (`src/lib/tags.ts:14`)
- 재사용 헬퍼: `createBit({content, threadId?, aiCollab?, private?})` (`src/lib/bits.ts:232`), `createThread(title)` (`src/lib/threads.ts:44`)
- Thread에 Bit 붙이는 전용 헬퍼 없음 — `createBit({threadId})` 또는 `prisma.bit.update`로 연결. 참고 패턴: thread-reply 라우트가 "thread 자동 생성 + bit 첨부" (`src/app/api/bits/[id]/thread-reply/route.ts:12`)
- 500자 강제: 서버 zod `max(500)` (`src/app/api/bits/route.ts:12`) + DB `VarChar(500)` + 클라 `MAX_LENGTH` (`src/components/bits/BitComposer.tsx:5`)
- **AI/LLM 연동 전무** — anthropic/openai/ai-sdk 없음. `aiCollab`은 수동 메타 플래그일 뿐 실제 모델 호출 아님 (그린필드)
- **스크래핑/URL-fetch 의존성 전무** — cheerio/readability/youtube-transcript/undici 없음. `jsdom`은 devDep(테스트용)뿐 (그린필드)
- 인증: `requireAuth()`가 쿠키 `db_auth === "1"` 확인 (`src/lib/auth.ts:9`), 오너는 고정 `DEV_USER`(`src/lib/bits.ts:5`), 소유자 검증 없음
- 클라 폼 패턴: `BitComposer.tsx`("use client", `/api/bits` POST) — 새 스크랩 폼이 자연스럽게 들어갈 자리 (`src/components/bits/`)

## Decisions

### D1: 파이프라인 = 입력 → fetch/추출 → AI 요약 → 비공개 draft → Irin 컨펌 → 발행
- **Status**: resolved
- **Rationale**: 딥 인터뷰에서 확정. 자동 발행(방문자 즉시 노출)은 DailyBit의 1인칭 학습기록 정체성과 충돌하므로 반드시 컨펌 게이트를 둔다.

### D2: AI 출력 = 충실한 요약 + 쉬운 보충 설명, 영문, 과장된 비유 금지
- **Status**: resolved
- **Rationale**: "단 하나의 산출물"로 사용자가 (a) 충실 요약을 선택, 톤은 절제. 영문 출력은 포트폴리오 English 전환과 일관(한국어화가 아님). 반려안: "나에게 핵심 3가지"/"Irin 말투 초안"은 결국 재작성 필요해 품 절감 효과 낮음.

### D3: 저장 상태 = 비공개 draft, Irin 컨펌 시에만 발행
- **Status**: resolved
- **Rationale**: AI 요약(3인칭·장문)과 Bit(1인칭·간결)는 다른 산출물이라 사람 검수 필수. 반려안: 자동 발행(품질/정체성 리스크).

### D4: draft 저장 = 별도 `ScrapDraft` 모델
- **Status**: resolved
- **Rationale**: 초안은 원본 URL·추출 원문·AI 결과·후보 세그먼트 등 발행 Bit에 없는 메타를 가짐. 컨펌 시 Bit/Thread 생성 후 draft 삭제. 반려안: Bit에 status enum 추가(발행물에 원본URL 등 오염), private=true 재사용(draft와 진짜 비공개 Bit 구분 불가). **중복/orphan 반박(steelman)**: ScrapDraft는 Bit 행을 복제하지 않는다 — 후보 세그먼트를 경량 JSON(`segments`)으로만 보관하고 발행 시 1회 매핑해 Bit를 만든다(스키마 이원화 아님). orphan은 D14의 라이프사이클(컨펌/폐기 시 삭제 + 오너 전용 draft 목록에서 수동 삭제)로 관리하며, 단일 오너·저볼륨이라 누적 위험이 낮다.

### D5: Bit vs Thread 분할 = AI가 세그먼트로 제안, Irin이 편집/확정
- **Status**: resolved
- **Rationale**: AI는 응답을 **세그먼트 배열**로 반환한다(각 세그먼트 = 발행 후보 Bit 1개). 세그먼트 1개면 단일 Bit, 2개 이상이면 주제 관통 Thread. 프롬프트가 각 세그먼트를 ≤500자·영문·절제 톤으로 생성하도록 지시하고, 서버가 저장 전 검증한다(D12). Irin은 컨펌 UI에서 세그먼트별 텍스트를 편집·병합·삭제하고 최종 확정한다. 반려안: 항상 단일 Bit(수동 분할 품 큼), 자유형 장문 텍스트(Bit 매핑 애매).

### D6: AI 프로바이더 = Anthropic Claude, 서버 Route Handler에서 호출
- **Status**: resolved
- **Rationale**: 프로젝트 기본 방침(최신 Claude 모델). 아키텍처 D1(Route Handler가 모든 API 처리)·D2(서버 컴포넌트 기본)에 맞춰 서버측에서 API 키로 호출. 반려안: OpenAI(방침 밖), 클라이언트 호출(키 노출).

### D7: v1 입력 범위 = URL(readability 추출) + 유튜브 자막 + 복붙 텍스트 fallback
- **Status**: resolved
- **Rationale**: 사용자의 주력 케이스. 스크린샷 OCR(멀티모달)은 복잡도 높아 v2로 미룸. 기본은 URL, 실패 시 텍스트.

### D8: fetch 실패 / 자막 없음 → 시스템이 알림, Irin이 복붙 텍스트로 fallback
- **Status**: resolved
- **Rationale**: 트위터/링크드인은 로그인 벽으로 서버 fetch 불가. 파이프라인을 중단하지 않고 수동 입력으로 넘긴다.

### D9: 작성자 = Irin 전용, 기존 `requireAuth`+DEV_USER 재사용
- **Status**: assumed
- **Rationale**: L1에서 확인된 오너 전용 쓰기 게이트를 그대로 사용. 인증 도입 전 DEV_USER 고정.

### D10: AI 생성 Bit는 `aiCollab = LED`로 표시
- **Status**: assumed
- **Rationale**: 기존 enum(NONE/HINT/LED) 재사용. AI 주도 초안임을 메타로 남겨 투명성 확보.

### D11: `ScrapDraft` 스키마 필드 (열거)
- **Status**: resolved
- **Rationale**: 발행 Bit와 분리되는 임시 데이터를 명시. 필드: `id`, `sourceType`(enum `URL | TEXT | YOUTUBE`), `sourceUrl String?`, `sourceTitle String?`, `rawExtract String @db.Text`(추출/붙여넣은 원문), `segments Json`(후보 배열 `[{ content, tags: string[] }]`, 각 content ≤500), `suggestedThreadTitle String?`(≤100, 세그먼트 2개↑일 때), `authorId`, `createdAt`, `updatedAt`. Bit 행을 만들지 않고 JSON으로만 후보를 보관 → 컨펌 시 1회 매핑.

### D12: AI 실패·과길이·비정상 출력 처리
- **Status**: resolved
- **Rationale**: (a) AI 호출 실패/타임아웃/rate-limit → draft를 만들지 않고 명확한 에러 메시지 반환(부분 draft 금지), Irin은 재시도 또는 텍스트 fallback. (b) 서버가 AI 세그먼트를 저장 전 검증: 각 `content` trim 후 ≤500 아니면 거부/재요청, 세그먼트 수 상한(예: 8) 초과 시 상한 적용. (c) 비용은 v1 범위 밖(단일 오너·저볼륨) — 별도 캡 없이 진행. 반려안: 실패 시 원문만 draft로 저장(반쪽 UX).

### D13: 컨펌(발행) 시 검증 + Thread 타이틀
- **Status**: resolved
- **Rationale**: 컨펌 엔드포인트가 편집된 각 세그먼트를 기존 서버 zod(`max(500)`, `min(1)`)로 재검증 — 초과 시 발행 차단하고 어느 세그먼트인지 알림(Irin이 trim). 세그먼트 2개↑면 `createThread(title)`로 Thread 생성 후 각 세그먼트를 `createBit({threadId, aiCollab:LED})`로 첨부; title은 `suggestedThreadTitle`(AI 생성, ≤100)을 Irin이 편집 가능. 세그먼트 1개면 단일 `createBit`. 발행 성공 시 D14대로 draft 삭제.

### D14: draft 라이프사이클
- **Status**: resolved
- **Rationale**: draft는 컨펌 발행 성공 시 삭제, Irin이 명시적으로 "폐기"해도 삭제. draft는 오너 전용 목록에서 조회·수동 삭제 가능(방문자 노출 절대 없음). 자동 만료(TTL)는 v1 미도입 — 단일 오너라 수동 정리로 충분, 필요 시 v2.

## Constraints
- `.env*` 편집이 훅으로 차단됨 → Anthropic API 키는 **Irin이 직접** 설정해야 함 (Claude가 대신 못 함)
- 발행 Bit content ≤ 500자 (DB `@db.VarChar(500)` + 서버 zod) — AI 세그먼트도 이 한도 준수
- 초안(draft)은 방문자에게 절대 노출 금지 — 항상 비공개
- 스키마 변경은 `prisma/schema.prisma`로만, `pnpm db:migrate` → `db:generate`
- pnpm 전용, App Router Route Handler로 API 구현, `@/lib/prisma`에서만 Prisma import
- 트위터/링크드인 서버사이드 fetch 불가(로그인 벽·JS 렌더링) → 자동 스크랩 v1 제외
- 새 런타임 의존성 추가 필요: URL fetch/추출(readability 계열), 유튜브 자막, Anthropic SDK

## Known Gaps
- 성공 기준 정량화 미정 — 현재는 행동 신호("안 그랬으면 기록 안 했을 것")뿐, 주당 발행 수·컨펌 소요시간 등 측정 지표 없음 (L2 provisional: Success Criteria)
- AI 비용/사용량 캡 미도입 — v1은 단일 오너·저볼륨 전제로 캡 없이 진행(D12), 볼륨 늘면 재검토
- 유튜브 비영어/자막 없음 세부 처리 미정 (D8의 수동 fallback으로 일단 흡수)
- 한국어 소스 유입 시 영문 변환 범위 — 기본 영문 출력 원칙만 정함

## Requirements

### R0: 개발 글 → AI 초안 → 컨펌 발행 (goal-level)

#### R0.1: 소스에서 발행까지 엔드투엔드
- **Given**: 로그인한 Irin이 개발 글 URL을 가지고 있음
- **When**: 스크랩 폼에 URL을 넣고 요약→컨펌→발행을 거침
- **Then**: 원문에서 추출·요약된 내용이 비공개 draft를 거쳐 Bit(또는 Thread)로 발행되고 draft는 삭제됨

### R1: 소스 수집·추출 (D7, D8)

#### R1.1: URL 기사 추출 (API)
- **Given**: 공개 접근 가능한 기사 URL
- **When**: `POST /api/scrap/extract` `{sourceType:"URL", url}`
- **Then**: 200과 함께 `{sourceTitle, rawExtract}` 반환 (readability로 본문 추출)

#### R1.2: 유튜브 자막 추출 (API)
- **Given**: 자막이 있는 유튜브 URL
- **When**: `POST /api/scrap/extract`가 유튜브로 판별
- **Then**: 200과 함께 자막 텍스트를 `rawExtract`로 반환

#### R1.3: 추출 실패 → fallback 신호 (API)
- **Given**: 로그인 벽/빈 HTML을 주는 URL(예: 트위터/링크드인)
- **When**: extract 시도
- **Then**: 422와 `reason:"fetch_failed"` 반환 (파이프라인 중단 아님, 수동 입력 유도)

#### R1.4: 텍스트 붙여넣기 경로 (API)
- **Given**: Irin이 원문 텍스트를 직접 보유
- **When**: `POST /api/scrap/extract` `{sourceType:"TEXT", rawExtract}`
- **Then**: 200과 함께 정규화된 텍스트 반환 (fetch 없음)

#### R1.5: 입력 폼 + 실패 시 fallback UI (UI)
- **Given**: 스크랩 페이지
- **When**: Irin이 URL 입력/텍스트 붙여넣기 후 제출, extract가 422 반환
- **Then**: UI가 실패 사유를 표시하고 텍스트 붙여넣기 fallback 필드를 노출

### R2: AI 요약 (D2, D6, D12)

#### R2.1: 세그먼트 생성 (API)
- **Given**: 추출된 `rawExtract`
- **When**: `POST /api/scrap/summarize` `{rawExtract}`
- **Then**: 서버가 Anthropic Claude를 호출해 `segments[]`(각 `content` ≤500, 영문, 절제 톤) 반환

#### R2.2: 세그먼트 검증·상한 (API)
- **Given**: AI가 500자 초과 세그먼트 또는 상한 초과 개수를 반환
- **When**: 서버가 응답을 처리
- **Then**: 초과 세그먼트는 거부/재요청, 세그먼트 수는 상한(≤8)으로 캡

#### R2.3: AI 실패 처리 (API)
- **Given**: Anthropic 호출이 타임아웃/에러
- **When**: summarize 실행
- **Then**: draft를 만들지 않고 502(또는 timeout) + 재시도 안내 반환 (부분 draft 없음)

#### R2.4: Thread 타이틀 제안 (API)
- **Given**: AI가 세그먼트를 2개 이상 생성
- **When**: summarize 완료
- **Then**: 응답에 `suggestedThreadTitle`(≤100자) 포함

### R3: draft 저장·라이프사이클 (D3, D4, D11, D14)

#### R3.1: draft 생성 (API)
- **Given**: summarize가 세그먼트를 생성
- **When**: `POST /api/scrap/drafts` (segments, sourceType, sourceUrl?, rawExtract, suggestedThreadTitle?)
- **Then**: `ScrapDraft` 행 생성 후 201 반환

#### R3.2: draft 목록 조회 — 오너 전용 (API)
- **Given**: draft ≥1개 존재
- **When**: 오너가 `GET /api/scrap/drafts`
- **Then**: 200 배열 반환; 비인증 요청이면 401

#### R3.3: draft 비노출 (UI/보안)
- **Given**: draft가 존재
- **When**: 방문자가 홈 피드/공개 페이지 로드
- **Then**: 어떤 draft 내용도 노출되지 않음

#### R3.4: draft 폐기 (API)
- **Given**: `id=X` draft 존재
- **When**: `DELETE /api/scrap/drafts/X` (오너)
- **Then**: 행 삭제, 204 반환

#### R3.5: draft 목록 UI (UI)
- **Given**: 미발행 draft가 있음
- **When**: 오너가 draft 목록 화면 진입
- **Then**: 각 draft를 열기/폐기할 수 있는 목록이 렌더링됨

### R4: 컨펌·발행 (D5, D10, D13)

#### R4.1: 세그먼트 편집 (UI)
- **Given**: 컨펌 UI에 draft가 열림
- **When**: Irin이 세그먼트 텍스트를 편집/병합/삭제
- **Then**: 세그먼트별 500자 카운터가 갱신되고, 초과 시 발행 버튼이 비활성

#### R4.2: 단일 Bit 발행 (API)
- **Given**: 세그먼트가 정확히 1개인 draft
- **When**: `POST /api/scrap/drafts/X/publish`
- **Then**: `createBit({content, tags, aiCollab:"LED"})` 실행 후 draft 삭제, 201

#### R4.3: Thread 발행 (API)
- **Given**: 세그먼트가 2개 이상인 draft
- **When**: `POST /api/scrap/drafts/X/publish` (편집된 title 포함)
- **Then**: `createThread(title)` 후 각 세그먼트를 `createBit({threadId, aiCollab:"LED"})`로 첨부, draft 삭제

#### R4.4: 발행 시 서버 재검증 (API)
- **Given**: 편집된 세그먼트 중 500자 초과가 존재
- **When**: publish 호출
- **Then**: 400과 함께 초과 세그먼트 인덱스를 알리고 아무것도 발행하지 않음

#### R4.5: 발행 플로우 UI (UI)
- **Given**: 컨펌 UI
- **When**: Irin이 발행 클릭
- **Then**: publish API 호출, 성공 시 생성된 Bit/Thread로 이동하고 목록에서 draft 사라짐

### R5: 접근 제어·표시 (D9, D3, D10)

#### R5.1: 오너 전용 쓰기 (API)
- **Given**: 비인증 요청
- **When**: `/api/scrap/*` 변경 요청(extract/summarize/drafts/publish/delete)
- **Then**: `requireAuth`로 401 반환

#### R5.2: AI 협업 표시 (UI/데이터)
- **Given**: draft에서 발행된 Bit
- **When**: 피드에 렌더링
- **Then**: 해당 Bit은 `aiCollab="LED"` 값을 가짐

## Tasks

### T1: 스키마 + 의존성 스캐폴딩 [infra]
- **Fulfills**: R3 (데이터 모델 토대)
- **Depends on**: (none)
- 내용: `prisma/schema.prisma`에 `ScrapDraft` 모델 + `SourceType` enum(URL/TEXT/YOUTUBE) 추가(D11 필드), `pnpm db:migrate` → `db:generate`. 런타임 의존성 일괄 설치(readability 계열, youtube 자막, `@anthropic-ai/sdk`)로 이후 태스크가 `package.json`을 중복 수정하지 않게 함.

### T2: 추출 서비스 lib [service, BE-only]
- **Fulfills**: R1.1, R1.2, R1.3, R1.4 (추출 로직)
- **Depends on**: T1
- 내용: `src/lib/scrap-extract.ts` — URL 판별→readability 본문 추출 / 유튜브 자막 추출 / 텍스트 정규화, 실패 시 `fetch_failed` 결과 반환. 순수 서비스(엔드포인트는 T4).

### T3: AI 요약 서비스 lib [service, BE-only]
- **Fulfills**: R2.1, R2.2, R2.3, R2.4 (요약 로직)
- **Depends on**: T1  ← T2와 병렬
- 내용: `src/lib/scrap-ai.ts` — Anthropic Claude 호출 래퍼(D6), 프롬프트(충실 요약+쉬운 설명, 영문, 과장 비유 금지), 응답을 `segments[]`로 파싱·각 ≤500 검증·개수 상한(≤8)·`suggestedThreadTitle` 생성, 실패/타임아웃 시 에러 표면화(부분 draft 없음).

### T4: 추출 엔드포인트 + 입력 UI [vertical]
- **Fulfills**: R1.5, R5.1 (+ R1.1~1.4 노출)
- **Depends on**: T2
- 내용: `POST /api/scrap/extract`(requireAuth, zod, T2 호출) + `src/components/scrap/` 입력 폼("use client"): URL 입력/제출, 422 시 실패 사유 표시 + 텍스트 붙여넣기 fallback 필드 노출.

### T5: 요약→draft 생성 플로우 [vertical]
- **Fulfills**: R2(연결), R3.1, R3.2
- **Depends on**: T3, T4
- 내용: `POST /api/scrap/summarize`(T3 호출) + `POST /api/scrap/drafts`(ScrapDraft 생성) + `GET /api/scrap/drafts`(오너 전용 목록), 입력 UI에서 추출→요약→draft 생성으로 이어지는 흐름 연결.

### T6: draft 목록·컨펌·발행 [vertical]
- **Fulfills**: R0(엔드투엔드 완성), R3.3, R3.4, R3.5, R4.1, R4.2, R4.3, R4.4, R4.5, R5.2
- **Depends on**: T1, T5
- 내용: draft 목록 UI + 컨펌/편집 UI(세그먼트별 500자 카운터, 초과 시 발행 비활성), `DELETE /api/scrap/drafts/X`(폐기), `POST /api/scrap/drafts/X/publish`(세그먼트 1개→`createBit`, 2개↑→`createThread`+`createBit(threadId)`, 모두 `aiCollab:"LED"`, 서버 재검증, 성공 시 draft 삭제), draft 방문자 비노출 보장.

## External Dependencies

### Pre-work
- Irin이 `ANTHROPIC_API_KEY`를 `.env.local`에 설정 (`.env*` 편집이 훅으로 차단되어 Claude가 대신 못 함)
- 마이그레이션을 Supabase에 적용(T1의 `db:migrate`)

### Post-work
- Vercel 프로젝트 환경변수에 `ANTHROPIC_API_KEY` 추가(배포용)
- PR 전 `/gemini-review` + `specs/tech-scrap/worklog.md` 작성
