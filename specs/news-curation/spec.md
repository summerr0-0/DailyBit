# Spec: news-curation

## Meta
- **Created**: 2026-11-18
- **Type**: dev
- **Status**: approved
- **Approved by**: user
- **Approved at**: 2026-11-18
- **Related**: `specs/news-curation/tech-review.md` (기술 검토·확정 결정), `gemini-spec-review.md` (Gemini 교차검증, 2026-11-18, 12건 중 11 반영·1 부분 반영)

## Goal
해외 AI·보안 소식을 자동 수집해 영어 GeekNews식 Bit 초안으로 만들고, Irin이 /scrap에서 확인 후 발행한다. (큐레이션 파이프라인 MVP 1단계)

## Non-goals
- 개념 글(Note, 마크다운) 모델·페이지 — MVP 2단계
- 뉴스 ↔ 개념 링크, 개념 초안 자동 생성 — MVP 3단계
- 비RSS 소스: Reddit(OAuth 필요), HN API, HF Daily Papers, Anthropic News(HTML) — MVP 5단계
- 팟캐스트(Dwarkesh, Latent Space) — 대본 길이 문제
- 자동 발행 (항상 Irin 컨펌 후 발행)
- 한국어 출력

## Confirmed Goal
하루 1~2회 GitHub Actions가 검증된 RSS 8~10개(AI 인물 블로그·연구소·보안 매체)를 수집한다. URL 정규화로 중복을 제거하고 관련도 필터와 하루 상한을 거쳐 남은 기사만 영어 GeekNews식 개조식 Bit 초안으로 만든다. 초안은 DailyBit DB의 `ScrapDraft`에 비공개로 저장되고, 오너 전용 /scrap 화면의 자동 수집 인박스에 쌓인다. Irin이 짧게 손봐 발행한다.
- 원문 본문: 기존 readability 추출 재사용, 실패 시 RSS 요약으로 대체
- 오래된 기사(약 48시간 초과)는 버려 밀린 날 초안이 쌓이지 않게 한다
- 완료 기준: 아침에 /scrap을 열면 출처가 정확히 붙은 뉴스 초안 3~5개가 있고, 짧게 손봐 바로 발행 가능. 같은 기사는 두 번 오지 않는다.

## Research
- **전제: tech-scrap(PR #20, `feature/tech-scrap`)이 아직 OPEN·미머지.** origin/main(`e9b7618`)에는 ScrapDraft·/scrap·scrap-ai·scrap-extract가 없다 → 운영 DB에 `scrap_drafts` 테이블도 없을 가능성 (`gh pr list`, `git log origin/main`)
- `ScrapDraft` 모델: `sourceType(URL|TEXT|YOUTUBE)`, `sourceUrl?`, `sourceTitle?`, `rawExtract Text`, `segments Json(string[])`, `suggestedThreadTitle?`, `authorId`. 출처 구분 필드(kind/feedItem) 없음 (`prisma/schema.prisma` ScrapDraft)
- `createDraft(input)`가 `ensureDevUser()`로 오너 귀속 후 생성 — 스크립트에서 그대로 호출 가능 (`src/lib/scrap-drafts.ts:64`)
- `publishDraft`: 세그먼트 1개 → `createBit({aiCollab:"LED"})`, 2개+ → Thread. 500자 서버 재검증 (`src/lib/scrap-drafts.ts:120-143`)
- `getDrafts()`는 kind 구분 없이 최신순 전체 반환 (`src/lib/scrap-drafts.ts:89`)
- `/scrap` 페이지: `isLoggedIn()` 오너 게이트 후 `ScrapWorkbench initialDrafts` 렌더 (`src/app/scrap/page.tsx`)
- `extractSource({sourceType:"URL", url})` — readability, 10s 타임아웃, 200자 미만이면 fetch_failed, 20,000자 절삭, **Chrome UA 위장** (`src/lib/scrap-extract.ts:9-18,95,148`)
- `summarize()`는 scrap 전용 프롬프트(요약+보충설명, 최대 8세그먼트, 모델 기본 `claude-opus-4-8`, `SCRAP_AI_MODEL` 오버라이드), structured output(json_schema) 사용 (`src/lib/scrap-ai.ts:9,15-30,88`) — 뉴스용 개조식 프롬프트는 별도 필요
- Bit 렌더러는 `#해시태그`만 링크화, **URL은 일반 텍스트로 표시** (`src/components/bits/BitCard.tsx:10-32`) → 출처 링크가 클릭되지 않음
- 태그: `TAG_PATTERN = /#([\p{L}\p{N}_]+)/gu`, `parseTags`가 본문에서 추출 (`src/lib/tags.ts:3,14`)
- Prisma: `prisma/migrations` 없음 → `prisma db push` 방식 (`package.json` db:push). Prisma 7 + pg adapter, `DATABASE_URL` 사용 (`src/lib/prisma.ts`)
- `tsx` devDep 존재, tsconfig `@/*` → `./src/*` 경로 별칭 (`package.json:75`, `tsconfig.json:21`)
- CI: `.github/workflows` unit(typecheck/lint/test:run) + e2e(postgres 서비스) — 예약 워크플로 없음
- 브랜치 정책: `feature/*` → PR → CI → squash merge, PR 전 `/gemini-review` + `specs/<feature>/worklog.md` 필수 (`docs/policies.md`)
- RSS 실측(2026-11-18 curl): 200 OK — Karpathy, Willison, Raschka, Interconnects, Import AI, One Useful Thing, OpenAI, DeepMind, Schneier, THN, Krebs, Ars(`feeds.arstechnica.com/arstechnica/index`), Register(`headlines.atom`), Techmeme(`feed.xml`), TLDR AI. BleepingComputer는 브라우저 UA 403 / 정직한 UA 200 (`tech-review.md`)
- RSS 파서 의존성 없음 (rss-parser/fast-xml-parser 미설치). `jsdom`은 dependencies에 있음 (`package.json`)

## Decisions

### D1: PR #20(tech-scrap) 먼저 머지 후 main에서 `feature/news-curation` 분기
- **Status**: resolved
- **Rationale**: 운영 DB에 `scrap_drafts`·/scrap이 없을 수 있어 재사용 전제가 성립하지 않음. #20을 main 기준으로 재확인·머지한 뒤 분기. 반려안: #20 위에 스택(두 PR 결합, #20 수정 시 리베이스 필요).

### D2: 실행 = GitHub Actions schedule, 하루 2회 06:00·18:00 KST (cron `0 21,9 * * *` UTC), 실행당 최대 3건
- **Status**: resolved
- **Rationale**: 미국 저녁 발표를 한국 아침에, 미국 오전 발표를 한국 저녁에 받음. 하루 최대 6건. `workflow_dispatch`로 수동 실행 가능, `concurrency` 그룹으로 중복 실행 방지. 반려안: Vercel Cron(피드 다수+LLM 다회 호출이 함수 시간 제한에 걸림), 로컬 launchd(맥 꺼지면 중단), 하루 1회 5건(사용자 선택에서 제외).

### D3: 스크립트 `scripts/curate.ts`가 `src/lib` 함수를 import해 운영 DB에 직접 기록
- **Status**: assumed
- **Rationale**: `tsx` + tsconfig `@/*` 별칭으로 기존 `createDraft`, `extractSource` 재사용. 반려안: 배포된 API 엔드포인트를 cron이 호출(인증 토큰 추가 필요, 함수 시간 제한).
- **런타임 전제**: 워크플로는 `pnpm install --frozen-lockfile` → `pnpm db:generate`(`src/generated`는 gitignore) → `pnpm tsx scripts/curate.ts`. `DATABASE_URL`은 Supabase **Session Pooler**(IPv4, GitHub 러너는 IPv6 없음). 스크립트는 종료 시 `prisma.$disconnect()` 후 명시적 exit(pg Pool로 인한 hang 방지). 초안 귀속은 `ensureDevUser()` — 모든 Bit의 저자인 고정 오너와 동일하므로 그대로 사용.
- **Steelman 대응** (앱 내부 결합·운영 DB 자격증명 GitHub 보관): (a) 재사용 모듈(`scrap-extract`, `scrap-drafts`, `news-*`, `prisma`)은 `next/*`·`server-only` import 금지 — ESLint `no-restricted-imports`로 강제, (b) `scripts/`를 tsconfig include에 넣어 CI typecheck 대상화, (c) CI에서 `curate.ts --dry-run`(DB·API 호출 없이 고정 피드 픽스처로 파이프라인 실행) 스모크 테스트, (d) 시크릿은 `production` GitHub Environment(main 브랜치 전용)에 보관.

### D4: 소스 = RSS 11개 (실측 200 OK)
- **Status**: assumed (Agent decides)
- **Rationale**: AI — Karpathy, Simon Willison, Sebastian Raschka, Interconnects, Import AI, OpenAI News, Google DeepMind. 보안 — Krebs, Schneier, The Hacker News, BleepingComputer. 소스 목록은 코드 상수 `src/lib/news-sources.ts`(추가/제거가 한 줄). 반려안: Techmeme·TLDR·Ars·Register(애그리게이터/범용 IT라 중복·잡음 많음, 이후 추가 가능), Mollick(교육·생산성 위주).

### D5: 중복 제거 = `FeedItem` 테이블, `urlNormalized @unique`
- **Status**: assumed
- **Rationale**: 정규화 = 소문자 호스트, `www.` 제거, `utm_*`·`ref`·`fbclid` 등 추적 파라미터 제거, fragment 제거, 끝 슬래시 제거. 재처리 여부는 D15 상태 전이표가 결정(DRAFTED·SKIPPED는 영구 종료 → 초안 삭제 후에도 재생성 안 됨). 소스 11개는 애그리게이터가 없어 제목 유사도 클러스터링은 이번 범위 밖. 정리 규칙: `publishedAt`이 30일 이전인 FeedItem만 삭제(이미 48h 신선도에서 걸러지므로 재등장해도 stale로 끝남). `publishedAt` 없는 SKIPPED 항목은 **삭제하지 않음**(삭제하면 피드에 남아 있는 한 매번 재삽입되므로; 건수 적음). [Gemini G8 반영]

### D6: 신선도 = 게시 48시간 초과 기사는 SKIPPED
- **Status**: resolved
- **Rationale**: 실행 누락 후 밀린 기사가 몰려오는 것 방지. 날짜 소스: RSS `pubDate`, Atom `<published>`만 사용 — Atom `<updated>`는 쓰지 않음(옛 글 수정으로 '신선한 글'이 되어 부활하는 것 방지). `publishedAt` 없는(또는 파싱 불가) 항목은 **첫 발견 시 SKIPPED** — 신선도를 판단할 수 없고, 30일 정리 후 재등장 버그(첫 발견 시각 리셋)를 막기 위함.

### D7: 필터 = Haiku 5.5가 후보 제목+RSS 요약을 한 번에 0~10점 채점 → 6점 이상, 점수순, 소스당 실행 1회 1건, 상위 3건
- **Status**: assumed
- **Rationale**: 기준 = AI/보안 실무자에게 새로운 사실(발표·취약점·연구 결과)인가, 의견·홍보·채용·이벤트는 감점. 6점 이상이 3건 미만이면 그만큼만 생성(억지로 채우지 않음). 소스당 1건으로 한 소스 독점 방지(inversion probe). 채점은 실행당 1회 호출, **새 후보만**(최대 60개, **소스별 라운드로빈**으로 채워 한 소스가 슬롯을 독점하지 않게) 채점하고 점수를 FeedItem에 저장 — 이전 실행에서 채점됐지만 상한에 밀린 CANDIDATE는 재채점 없이(재과금 없이) 48시간 내 다음 실행에서 다시 경쟁. 반려안: 업보트 점수(RSS엔 없음), 전부 생성 후 사람이 거름(검수 큐 폭증).

### D8: 본문 = `extractSource` readability 재사용, 실패 시 RSS description/content로 대체
- **Status**: resolved
- **Rationale**: RSS 대체 시 HTML 태그 제거 + **HTML 엔티티 디코딩** + 20,000자 절삭(extractSource와 동일). 둘 다 200자 미만이면 SKIPPED. 피드 요청: 타임아웃 10s, 응답 최대 5MB, 동시 4개, 재시도 없음(다음 실행이 재시도). [G7, G9 반영] 피드 요청은 정직한 UA `DailyBitFeedReader/1.0 (+https://<site>)`. 본문 추출 UA(Chrome 위장)는 tech-scrap 동작이라 이번엔 건드리지 않되, BleepingComputer는 본문 추출이 403이면 RSS 요약으로 대체됨.

### D9: 출력 = 영어 GeekNews식 단일 Bit 초안 (뉴스 전용 프롬프트 `src/lib/news-ai.ts`)
- **Status**: assumed
- **Rationale**: 형식 = 헤드라인 1줄 + `- ` 불릿 3~4개(사실만) + 빈 줄 + 원문 URL 1줄 + 소문자 해시태그 1~3개, 전체 ≤500자. Sonnet 5.5, structured output `{headline, bullets[], tags[]}` → **코드가 조립**. 본문 URL = 추적 파라미터를 제거한 정규화 URL(`urlNormalized`; 원본의 utm 등이 500자를 잠식하지 않게) [G3]. LLM 출력의 `https?://`·`www.` 토큰은 headline·bullets 모두에서 제거하고 warning(`llm_url_removed`) — 남은 문장은 사람이 다듬음, 스킴 없는 도메인 제거는 오탐(Node.js 등) 때문에 하지 않음 [G5 일부 반영].
- **태그 정제** [G4]: 소문자화, 앞 `#` 제거, 공백·하이픈 제거(`open-source`→`opensource`, `red team`→`redteam`), `[\p{L}\p{N}_]` 외 문자 제거, 빈 값·중복 제거, 최대 3개. 결과가 0개면 소스 category(`ai`/`security`) 태그 1개. 금지어 목록(game-changer, revolutionary, groundbreaking, unlock, "remains to be seen" 등) 정규식 검사 → 걸리면 warning.
- **500자 초과 처리**: 조립 후 500자 초과면 마지막 불릿부터 제거, 불릿 2개 미만이 되면 FAILED.
- **숫자 검사**: 출력에서 `/\d[\d.,]*\d|\d/` 토큰 추출 → 쉼표 제거 → 쉼표 제거한 rawExtract에 문자열로 존재하는지 확인. 없으면 warning(발행 차단 아님). 예: `1,200` vs 원문 `1200` → 통과 / `3x` → `3` 검사 / `CVE-2026-1234` → `2026`·`1234` 각각 검사 / `1.2M` vs 원문 `1,200,000` → warning(오탐 허용, 사람이 확인).
- warning은 본문이 아닌 `ScrapDraft.warnings`에 저장, 인박스 카드 상단에 표시. 반려안: 기존 `summarize()` 재사용(요약+보충설명·최대 8세그먼트라 뉴스 형식과 다름).

### D10: `ScrapDraft` 확장 — `kind DraftKind @default(MANUAL)` (MANUAL|NEWS), `feedItemId String? @unique`, `sourceLabel String?`, `warnings String[]`
- **Status**: assumed
- **Rationale**: 기존 수동 스크랩과 구분해 인박스·자동 삭제 대상을 식별. `sourceType=URL` 유지. `sourceLabel`(예: "Krebs on Security")은 생성 시 복사 저장 — FeedItem 정리로 feedItemId가 SetNull 돼도 카드에 소스명 유지 [G1]. 저장은 새 함수 `createNewsDraft(tx)`가 `prisma.$transaction` 안에서 ScrapDraft 생성 + FeedItem DRAFTED 갱신을 함께 수행(기존 `createDraft`는 수동 스크랩용으로 그대로) [G10]. 반려안: 별도 NewsDraft 모델(발행 로직 중복).

### D11: 미검토 NEWS 초안은 생성 3일 후 다음 실행에서 자동 삭제
- **Status**: resolved
- **Rationale**: 뉴스는 빨리 낡음. MANUAL 초안은 건드리지 않음. FeedItem은 남아 재생성되지 않음.

### D12: /scrap에 "News inbox" 섹션 — NEWS 초안을 수동 초안과 분리 표시
- **Status**: assumed
- **Rationale**: `getDrafts({ kind })` 파라미터 추가 — kind 미지정 시 전체(기존 호출부 호환), /scrap은 MANUAL·NEWS를 각각 조회해 분리 렌더. 남은 보관 = `createdAt + 3d - now`, 24h 이상이면 "expires in N days"(내림), 미만이면 "expires in Nh"(최소 1h). 서버 컴포넌트에서 문자열로 계산해 내려 hydration 불일치 방지 [G11]. 각 카드에 소스명·원문 제목·생성 시각·남은 보관일·warnings 표시. 편집/발행/폐기는 기존 DraftEditor·publishDraft 재사용(aiCollab=LED).

### D13: Bit 본문 URL 자동 링크
- **Status**: resolved
- **Rationale**: BitCard 렌더러가 `https?://` URL을 `<a target="_blank" rel="noopener noreferrer nofollow">`로 렌더(다른 스킴 무시, React 이스케이프 유지). URL 내부의 `#`은 해시태그로 파싱하지 않음 — `parseTags`와 렌더러 모두 URL 구간을 먼저 제외(pair tension: URL fragment가 태그로 오염). 모든 Bit에 적용, 2단계 Note 링크에도 재사용. 반려안: Bit.sourceUrl 필드(스키마·UI 변경 큼).
- URL 판정: `/https?:\/\/[^\s<>"']+/` 매치 후 끝의 `.,;:!?` 제거, 끝 `)`는 URL 안의 `(`·`)` 개수가 균형이 맞을 때까지 제거(괄호 균형 검사). [G5] 테스트 케이스: `see https://a.com/x.` / `(https://a.com/x)` / `https://en.wikipedia.org/wiki/A_(b)` / `(https://en.wikipedia.org/wiki/A_(b))` / `https://a.com/p#frag #ai` → 태그는 `ai`만.
- **기존 Bit 태그 백필 없음** — 저장된 tags는 생성 시 파싱 결과라 그대로 둠(URL fragment를 가진 기존 Bit는 사실상 없음, 필요 시 별도 작업).

### D14: 실패 격리 — 피드/기사 단위 실패는 로그 후 계속, AI 실패 항목은 FeedItem `FAILED`, `attempts < 2`이고 48시간 내면 다음 실행에서 재시도(실행당 3건 상한에 포함)
- **Status**: assumed
- **Rationale**: 한 피드 403이 전체를 막지 않게. 전 피드 실패 또는 DB 연결 실패 시에만 exit 1 → GitHub Actions 실패 메일로 인지. 실행 요약(수집/스킵/생성 수) 로그 출력.

### D15: FeedItem 스키마와 상태 전이
- **Status**: assumed
- **필드**: `id`, `url`(원본), `urlNormalized @unique`, `sourceId`(news-sources 상수 키), `title`, `summary Text?`(RSS description), `publishedAt DateTime?`, `firstSeenAt @default(now())`, `score Int?`, `status FeedItemStatus`, `skipReason String?`, `attempts Int @default(0)`, `updatedAt`. `@@index([status, publishedAt])`.
- **상태**: `CANDIDATE | SKIPPED | FAILED | DRAFTED`

| 현재 | 조건 | 다음 |
|---|---|---|
| (없음) | publishedAt 없음 또는 48h 초과 | SKIPPED (stale / no_date) |
| (없음) | 신선 → 채점 <6 | SKIPPED (low_score) |
| (없음) | 신선 → 채점 ≥6 | CANDIDATE |
| CANDIDATE | 선정(상위 3·소스당 1) → 본문·RSS 모두 200자 미만 | SKIPPED (no_content) |
| CANDIDATE | 선정 → AI 실패 / 조립 후 불릿<2 | FAILED (attempts=1) |
| CANDIDATE·FAILED | 선정 → 초안 생성 성공 | DRAFTED (ScrapDraft.feedItemId 연결) |
| CANDIDATE | 선정 안 됨 | CANDIDATE 유지(재채점 없음) |
| CANDIDATE·FAILED | publishedAt 48h 초과 | SKIPPED (stale) |
| FAILED | 재선정 → 본문·RSS 모두 200자 미만 | SKIPPED (no_content) |
| FAILED | 재선정 → 다시 생성 실패(attempts가 2가 됨) | **즉시** SKIPPED (gave_up) |
- DRAFTED·SKIPPED는 종료 상태. 초안 삭제(수동 폐기/3일 만료)는 FeedItem을 바꾸지 않음.
- 선정 풀 = 신규 CANDIDATE + 기존 CANDIDATE + 재시도 가능 FAILED, 점수순 → 소스당 1 → 상위 3.

## Constraints
- 자동 발행 금지 — 모든 뉴스는 비공개 ScrapDraft를 거쳐 오너 컨펌 후 발행
- LLM 출력에 URL 금지, 원문 링크는 FeedItem의 원본 URL만 사용
- 원문 전문 재게시 금지 — rawExtract는 비공개 초안에만 저장
- 발행 Bit ≤500자 (기존 서버 재검증 유지)
- pnpm only, App Router only, Prisma schema가 DB 단일 출처(`db push`)
- 비용 상한: 실행당 Haiku 1회(배치 실패 시 10개 단위 재시도로 최대 7회) + Sonnet 최대 3회 (FAILED 재시도 포함, no_content는 모델 호출 없음)
- 재사용 모듈(`src/lib/scrap-*`, `news-*`, `prisma`)은 `next/*`·`server-only` import 금지 (cron 스크립트 호환)
- 운영 시크릿은 GitHub `production` Environment에만, Supabase Session Pooler URL 사용

## Known Gaps
- 소스 목록(D4)은 assumed — 운영 2주 후 소스별 발행률 보고 조정
- 관련도 6점 임계값(D7)은 초기값 — 실제 채점 분포 보고 조정
- (해결) 운영 DB `db push` 시점 → External Dependencies Pre/Post-work에 명시

## Requirements

### R0: 자동 수집 뉴스가 하루 2회 비공개 초안으로 쌓이고 오너가 발행한다 (Confirmed Goal)

#### R0.1: 정상 실행 1회가 초안 최대 3건을 만든다
- **Given**: 11개 피드 중 48시간 내 기사 20건, 그중 6점 이상 5건(서로 다른 소스 4개)
- **When**: `scripts/curate.ts`가 실행된다
- **Then**: kind=NEWS ScrapDraft 3건이 생성되고, 공개 피드(Bit 목록)에는 아무것도 추가되지 않으며, 로그에 수집/스킵/후보/생성 수가 출력된다

#### R0.2: 오너가 인박스에서 발행한다
- **Given**: NEWS 초안 1건이 /scrap News inbox에 있다
- **When**: 오너가 편집 후 Publish를 누른다
- **Then**: aiCollab=LED, 원문 URL이 포함된 단일 Bit가 공개되고 초안은 삭제된다

### R1: 전제·스키마 (D1, D10, D15)

#### R1.1: tech-scrap이 main에 있다
- **Given**: PR #20이 OPEN
- **When**: news-curation 브랜치를 만들기 전
- **Then**: #20이 main에 머지되어 있고, `feature/news-curation`은 그 main에서 분기된다

#### R1.2: 스키마 추가
- **Given**: 머지된 main의 schema.prisma
- **When**: `prisma db push`
- **Then**: `feed_items` 테이블(D15 필드, `urlNormalized` unique, `(status, publishedAt)` 인덱스)과 `ScrapDraft.kind`(기본 MANUAL)·`feedItemId`(unique, nullable)·`warnings`(String[])가 생기고, 기존 ScrapDraft 행은 kind=MANUAL이 된다

### R2: 피드 수집과 URL 정규화 (D4, D5, D8 UA)

#### R2.1: 소스 정의
- **Given**: `src/lib/news-sources.ts`
- **When**: 모듈을 로드
- **Then**: D4의 11개 소스가 `{id, name, feedUrl, category: "ai"|"security"}`로 export된다

#### R2.2: RSS·Atom 모두 파싱
- **Given**: RSS 2.0 픽스처와 Atom 픽스처
- **When**: `fetchFeed(source)`
- **Then**: 각 항목이 `{url, title, summary, publishedAt|null}`로 반환되고, 요청 헤더 User-Agent는 `DailyBitFeedReader/1.0`으로 시작한다

#### R2.2b: 피드 요청 제한
- **Given**: 피드 서버가 연결 후 응답하지 않음 / 6MB 응답
- **When**: `fetchFeed`
- **Then**: 10초 후 / 5MB 초과 시 해당 피드만 에러로 끝나고 나머지 피드는 동시 4개로 계속 처리된다

#### R2.2c: Atom 날짜
- **Given**: `<updated>`만 있고 `<published>`가 없는 Atom 항목
- **When**: 파싱
- **Then**: publishedAt=null (→ R3.1에 따라 SKIPPED no_date)

#### R2.3: URL 정규화
- **Given**: `https://WWW.Example.com/post/?utm_source=x&id=3&fbclid=y#top`
- **When**: `normalizeUrl()`
- **Then**: `https://example.com/post?id=3` 반환 (호스트 소문자, www 제거, 추적 파라미터·fragment·끝 슬래시 제거, 나머지 쿼리 유지)

#### R2.4: 이미 본 URL은 무시
- **Given**: `urlNormalized`가 같은 FeedItem이 어떤 상태로든 존재
- **When**: 같은 기사가 다른 표기(utm 포함 등)로 다시 수집됨
- **Then**: 새 FeedItem이 생기지 않고 상태도 바뀌지 않는다

### R3: 신선도와 상태 전이 (D6, D15)

#### R3.1: 날짜 없음/오래됨은 즉시 SKIPPED
- **Given**: 새 항목 A(publishedAt 없음), B(50시간 전)
- **When**: 수집 단계
- **Then**: A는 SKIPPED(no_date), B는 SKIPPED(stale)로 저장되고 채점 대상이 아니다

#### R3.2: 기존 후보의 만료
- **Given**: 49시간 전 게시된 CANDIDATE와 FAILED 항목
- **When**: 다음 실행
- **Then**: 둘 다 SKIPPED(stale)로 바뀌고 선정 풀에서 빠진다

#### R3.3: 종료 상태 불변
- **Given**: DRAFTED 항목의 초안이 폐기되었거나 만료로 삭제됨
- **When**: 다음 실행
- **Then**: FeedItem은 DRAFTED 그대로이고 같은 기사로 초안이 다시 생기지 않는다

### R4: 관련도 채점과 선정 (D7, D14 상한)

#### R4.1: 신규 항목만 1회 채점
- **Given**: 신선한 신규 항목 12개와 이전 실행의 CANDIDATE 2개
- **When**: 채점 단계
- **Then**: Haiku 호출은 1회, 입력은 신규 12개뿐이며 각 점수가 FeedItem.score에 저장된다. 6 이상은 CANDIDATE, 미만은 SKIPPED(low_score)

#### R4.2: 채점 후보 상한
- **Given**: 신규 신선 항목 75개
- **When**: 채점 단계
- **Then**: 소스별 라운드로빈(각 소스 최신순)으로 60개가 채점되고 나머지 15개는 FeedItem을 만들지 않아 다음 실행에서 다시 고려된다

#### R4.3: 선정 규칙
- **Given**: 풀 = OpenAI 9점·OpenAI 8점·Krebs 7점·Willison 7점·Schneier 6점, 그리고 attempts=1인 FAILED DeepMind 8점
- **When**: 선정
- **Then**: OpenAI 9, DeepMind 8, Krebs 7(또는 Willison 7, 동점은 publishedAt 최신 우선) 3건 선정. OpenAI 8은 CANDIDATE로 남는다

#### R4.4: 후보 부족 시 억지로 채우지 않음
- **Given**: 풀에 6점 이상이 1건
- **When**: 선정
- **Then**: 초안 1건만 생성된다

#### R4.5: 채점 실패
- **Given**: Haiku 호출이 에러
- **When**: 채점 단계
- **Then**: 신규 항목은 FeedItem을 만들지 않고(다음 실행에서 재채점) 기존 풀만으로 선정을 계속한다

### R5: 본문 확보 (D8)

#### R5.1: readability 우선
- **Given**: 선정 항목의 원문 페이지에서 본문 1,500자 추출 가능
- **When**: 본문 단계
- **Then**: `extractSource`의 결과가 rawExtract가 된다

#### R5.2: RSS 요약으로 대체
- **Given**: 원문 요청 403, RSS summary 400자
- **When**: 본문 단계
- **Then**: HTML 태그 제거·엔티티 디코딩(`&amp;`→`&`, `&#8217;`→`’`)·20,000자 절삭한 RSS summary가 rawExtract가 된다

#### R5.3: 둘 다 부족
- **Given**: 추출 실패, RSS summary 120자
- **When**: 본문 단계
- **Then**: FeedItem은 SKIPPED(no_content), Sonnet은 호출되지 않는다

### R6: 초안 생성과 조립 (D9)

#### R6.1: 구조화 출력 → 코드 조립
- **Given**: Sonnet이 `{headline, bullets[4], tags["ai","openai"]}` 반환
- **When**: `buildNewsBit(output, feedItem)`
- **Then**: `headline\n- b1\n- b2\n- b3\n- b4\n\n{feedItem.urlNormalized}\n#ai #openai` 형식 문자열이 되고, 본문의 URL은 정규화 URL 하나뿐이다

#### R6.2: LLM 출력 속 URL 제거
- **Given**: bullet 하나에 `see https://evil.example`가 포함
- **When**: 조립
- **Then**: 해당 URL 문자열은 제거되고 warnings에 `llm_url_removed`가 추가된다

#### R6.2b: 태그 정제
- **Given**: tags `["#AI", "open-source", "red team", "ai", "llm", "x"]`
- **When**: 조립
- **Then**: `#ai #opensource #redteam` (중복 제거, 최대 3개); tags가 `[]`이면 소스 category 태그 1개

#### R6.3: 500자 초과 축약
- **Given**: 조립 결과가 560자
- **When**: 조립
- **Then**: 마지막 불릿부터 제거해 ≤500자가 되며, 불릿이 2개 미만이 되면 결과는 실패(FeedItem FAILED)

#### R6.4: 금지어 경고
- **Given**: bullet에 "game-changer" 포함
- **When**: 린트
- **Then**: warnings에 `banned:game-changer`가 들어가고 초안은 그대로 생성된다

#### R6.5: 숫자 검사 경고
- **Given**: 출력에 `40%`·`1,200`, rawExtract에 `1200`만 존재
- **When**: 숫자 검사
- **Then**: `1,200`은 통과, `40`은 warnings에 `number_not_in_source:40`

#### R6.6: 초안 저장
- **Given**: 조립 성공
- **When**: 저장
- **Then**: `createNewsDraft`가 한 트랜잭션에서 ScrapDraft(kind=NEWS, sourceType=URL, sourceLabel=소스명, sourceUrl=feedItem.url, sourceTitle=feedItem.title, rawExtract, segments=[조립 문자열], feedItemId, warnings)가 생기고 FeedItem은 DRAFTED가 된다(같은 트랜잭션)

### R7: 실패 격리와 재시도 (D14)

#### R7.1: 피드 하나 실패
- **Given**: BleepingComputer 피드 403, 나머지 10개 정상
- **When**: 실행
- **Then**: 해당 피드 에러가 로그에 남고 나머지로 정상 진행, exit 0

#### R7.2: 초안 생성 실패와 재시도
- **Given**: 선정 항목의 Sonnet 호출이 타임아웃
- **When**: 생성 단계
- **Then**: FeedItem FAILED, attempts=1. 다음 실행에서 48시간 내면 선정 풀에 다시 들어가고, 재시도도 실패하면 그 실행에서 즉시 SKIPPED(gave_up)

#### R7.3: 전체 실패는 job 실패
- **Given**: 모든 피드 실패 또는 DB 연결 실패
- **When**: 실행
- **Then**: exit 1 (GitHub Actions 실패 알림)

#### R7.4: 정상 종료
- **Given**: 실행 완료
- **When**: 스크립트 끝
- **Then**: `prisma.$disconnect()` 후 프로세스가 종료되어 job이 hang하지 않는다

### R8: 만료와 정리 (D11, D5)

#### R8.1: 3일 지난 NEWS 초안 삭제
- **Given**: 73시간 전 NEWS 초안 1건, 73시간 전 MANUAL 초안 1건
- **When**: 실행 시작 시 정리 단계
- **Then**: NEWS 초안만 삭제되고 MANUAL은 남는다

#### R8.2: 30일 지난 FeedItem 정리
- **Given**: publishedAt 31일 전 FeedItem 1건, publishedAt 없는 SKIPPED(no_date) 항목(firstSeenAt 40일 전) 1건
- **When**: 정리 단계
- **Then**: 앞의 것만 삭제(연결 초안의 `feedItemId`는 SetNull, `sourceLabel`은 유지), 날짜 없는 항목은 남아 재삽입되지 않는다

### R9: /scrap News inbox (D12)

#### R9.1: 데이터 계층 kind 필터
- **Given**: MANUAL 2건, NEWS 3건
- **When**: `getDrafts({kind:"NEWS"})` / `getDrafts()`
- **Then**: 각각 3건 / 5건 반환, DTO에 kind·warnings·createdAt 포함

#### R9.2: 인박스 렌더
- **Given**: 로그인한 오너, NEWS 초안 2건(하나는 warnings 1개, 생성 30시간 전)
- **When**: /scrap 진입
- **Then**: 수동 초안 목록과 분리된 "News inbox" 섹션에 카드 2개, 각 카드에 sourceLabel·원문 제목(원문 링크)·"expires in 1 day"·경고 배지 표시. 생성 60시간 전 초안은 "expires in 12h"

#### R9.3: 비로그인 차단
- **Given**: 비로그인 방문자
- **When**: /scrap 진입
- **Then**: 초안이 하나도 렌더되지 않는다 (기존 게이트 유지)

#### R9.4: 인박스에서 발행/폐기
- **Given**: News inbox 카드
- **When**: Publish 또는 Discard
- **Then**: 기존 `/api/scrap/drafts/[id]/publish`·DELETE 경로가 그대로 동작하고 카드가 사라진다

### R10: Bit 본문 URL 링크화와 태그 파싱 (D13)

#### R10.1: URL 링크 렌더
- **Given**: Bit 본문 `see https://a.com/x. #ai`
- **When**: BitCard 렌더
- **Then**: `https://a.com/x`가 `target=_blank rel="noopener noreferrer nofollow"` 링크, 마침표는 링크 밖, `#ai`는 태그 링크

#### R10.2: 괄호 처리
- **Given**: `(https://a.com/x)`와 `https://en.wikipedia.org/wiki/A_(b)`
- **When**: 렌더
- **Then**: 첫 번째는 바깥 `)` 제외, 두 번째는 `_(b)` 포함 전체가 링크, `(https://en.wikipedia.org/wiki/A_(b))`는 `_(b)`까지 링크·바깥 `)` 제외

#### R10.3: URL fragment는 태그 아님
- **Given**: 본문 `https://a.com/p#frag #ai`
- **When**: `parseTags` 및 렌더
- **Then**: 태그는 `["ai"]`뿐이고 `#frag`는 URL 링크의 일부로 렌더

#### R10.4: 비http 스킴 무시
- **Given**: 본문 `javascript:alert(1)` 또는 `ftp://x`
- **When**: 렌더
- **Then**: 링크가 되지 않고 일반 텍스트로 표시

### R11: 실행 환경 (D2, D3)

#### R11.1: 예약 워크플로
- **Given**: `.github/workflows/curate.yml`
- **When**: 매일 21:00·09:00 UTC 또는 workflow_dispatch
- **Then**: production Environment 시크릿(DATABASE_URL, ANTHROPIC_API_KEY)으로 install → db:generate → curate 실행, `concurrency: curate`로 동시 실행 1개

#### R11.2: CI 스모크
- **Given**: 기존 CI unit 잡
- **When**: PR
- **Then**: `scripts/`가 typecheck 대상이고, `curate.ts --dry-run`이 픽스처 피드·mock AI로 DB/네트워크 없이 성공한다

#### R11.3: 재사용 모듈의 Next 의존 금지
- **Given**: `src/lib/scrap-*`, `src/lib/news-*`, `src/lib/prisma.ts`
- **When**: lint
- **Then**: `next/*`·`server-only` import가 있으면 ESLint 에러

## Tasks

### T1: 스키마 확장 + 초안 kind 조회 [infra]
- **Fulfills**: R1.2, R9.1
- **Depends on**: (none — Pre-work 완료 후)
- **Files**: `prisma/schema.prisma`(FeedItem, FeedItemStatus, DraftKind, ScrapDraft 필드, feedItemId onDelete SetNull), `src/lib/scrap-drafts.ts`(getDrafts({kind}), DTO에 kind·sourceLabel·warnings, createNewsDraft(트랜잭션), deleteExpiredNewsDrafts)

### T2: Bit 본문 URL 링크화 + URL 안 #은 태그 제외 [vertical]
- **Fulfills**: R10.1, R10.2, R10.3, R10.4
- **Depends on**: (none) ← T1·T3·T4와 병렬
- **Files**: `src/lib/linkify.ts`(신규, URL 구간 토크나이저), `src/lib/tags.ts`(parseTags가 URL 구간 제외), `src/components/bits/BitCard.tsx`(renderContent), 각 단위 테스트

### T3: 피드 소스·수집·URL 정규화 [internal service]
- **Fulfills**: R2.1, R2.2, R2.2b, R2.2c, R2.3
- **Depends on**: (none) ← 병렬
- **Files**: `src/lib/news-sources.ts`, `src/lib/news-feed.ts`(fetchFeed, normalizeUrl, RSS/Atom 파싱 — `fast-xml-parser` 추가), `src/lib/__fixtures__/feeds/*.xml`, 테스트

### T4: 뉴스 AI — 채점·생성·조립·린트 [internal service]
- **Fulfills**: R6.1, R6.2, R6.2b, R6.3, R6.4, R6.5, R4.1(채점 호출부)
- **Depends on**: (none) ← 병렬
- **Files**: `src/lib/news-ai.ts`(scoreItems: Haiku 5.5 1회 structured output, generateNews: Sonnet 5.5 `{headline,bullets,tags}`, 모델은 `NEWS_SCORE_MODEL`/`NEWS_WRITE_MODEL` 오버라이드), `src/lib/news-compose.ts`(buildNewsBit, stripUrls, bannedWords, checkNumbers — 순수 함수), 테스트

### T5: 큐레이션 오케스트레이터 + dry-run [vertical, pipeline]
- **Fulfills**: R0.1, R2.4, R3.1, R3.2, R3.3, R4.1, R4.2, R4.3, R4.4, R4.5, R5.1, R5.2, R5.3, R6.6, R7.1, R7.2, R7.3, R7.4, R8.1, R8.2
- **Depends on**: T1, T3, T4
- **Files**: `src/lib/news-curate.ts`(runCuration(deps) — 정리→수집→신선도→채점→선정→본문→생성→저장, 의존성 주입으로 테스트 가능), `scripts/curate.ts`(CLI, `--dry-run` = 픽스처 피드 + mock AI + 인메모리 저장소), 테스트(상태 전이표 전 행)

### T6: /scrap News inbox [vertical, UI]
- **Fulfills**: R9.2, R9.3, R9.4, R0.2
- **Depends on**: T1 (DTO), T2 (발행된 Bit의 링크 렌더 확인)
- **Files**: `src/app/scrap/page.tsx`, `src/components/scrap/NewsInbox.tsx`(신규, 기존 DraftEditor 재사용), e2e 1개(인박스 표시→발행→피드에 링크 있는 Bit)

### T7: 예약 워크플로 + CI 스모크 + 의존 금지 린트 [infra]
- **Fulfills**: R11.1, R11.2, R11.3
- **Depends on**: T5
- **Files**: `.github/workflows/curate.yml`, `.github/workflows/ci.yml`(dry-run 스텝), `eslint.config.mjs`(no-restricted-imports), `tsconfig.json`(scripts include)

## External Dependencies

### Pre-work
- PR #20(tech-scrap)을 최신 main 기준으로 재확인(CI 통과) → 운영 DB에 `prisma db push`로 `scrap_drafts` 반영 → 머지 → main에서 `feature/news-curation` 분기 (R1.1)
- Supabase **Session Pooler** 연결 문자열 확인 (GitHub 러너 IPv4 전용)
- GitHub repo에 `production` Environment 생성(배포 브랜치 main 제한) + secrets `DATABASE_URL`, `ANTHROPIC_API_KEY`
- Anthropic API 키의 사용 한도 확인 (하루 Haiku 2회 + Sonnet 최대 6회)

### Pre-merge
- **PR 머지 직전** 운영 DB에 `prisma db push` — 머지 즉시 Vercel 배포가 새 컬럼을 조회하므로 먼저 적용. 변경은 신규 테이블 + default/nullable 컬럼 추가뿐이라 구버전 앱과 호환 [G12]. #20의 `scrap_drafts`도 같은 원칙(머지 전 push).

### Post-work
- `workflow_dispatch`로 수동 1회 실행 → 로그 수치와 /scrap News inbox 확인
- 2주 운영 후 소스별 발행률·점수 분포 보고 소스 목록(D4)과 임계값(D7) 조정
- `specs/news-curation/worklog.md` 작성, 볼트 DailyBit 노트 갱신

## Implementation Notes (2026-11-18, Gemini diff review 반영)
- 본문 URL: 정규화 URL 대신 `cleanUrl`(추적 파라미터·fragment만 제거, www·끝 슬래시 유지) — urlNormalized는 중복 제거 키 전용. (D9 개정)
- 채점 배치 실패 → 10개씩 1회 재시도 → 그래도 실패한 묶음은 SKIPPED(score_failed). 한 기사가 매 실행 배치를 막는 것 방지. (R4.5 개정)
- 생성 루프: 6점 이상을 점수순으로 돌며 소스당 1건, Sonnet 호출 3회에서 멈춤. no_content는 슬롯을 쓰지 않고 차순위(같은 소스 포함)가 대신 들어옴.
- 숫자 검사는 최종 본문(500자 절삭·URL 제거 후)의 headline·불릿만.
- 피드 항목은 http(s) 절대 URL만, 빈 피드는 [], Atom text/html/xhtml 타입별 처리(`Vec&lt;T&gt;` 보존).
- /scrap은 cron 사이에 보관 기간이 지난 NEWS 초안을 숨김.
- 기각: linkify의 `(url)#tag` 붙은 경우(드묾), stripUrls 후 괄호 잔여(경고로 사람이 확인), "1,2" 숫자 오탐(경고만).

### 변경 (2026-11-18): AI 백엔드 = Claude Code CLI (사용자 결정)
- API 키(`ANTHROPIC_API_KEY`) 대신 Claude 구독으로 실행: GitHub Actions에서 `@anthropic-ai/claude-code`를 설치하고 `claude -p --json-schema`로 호출, 인증은 `claude setup-token`으로 만든 `CLAUDE_CODE_OAUTH_TOKEN` secret.
- `src/lib/news-ai-cli.ts`가 NewsAiClient를 구현(도구·MCP·설정·세션 저장 끔, 시스템 프롬프트 대체). `NEWS_AI_BACKEND=cli`로 선택, 미설정 시 기존 SDK 경로.
- 반려안: 맥 launchd 로컬 실행(맥이 켜져 있어야 함), Gemini agy(할당량 적음·리뷰 전용, 로컬 전용).
- 로컬 실측: Haiku 채점(관련 9 / 웨비나 1), Sonnet 생성 → 조립까지 정상.
