# Worklog: news-curation (MVP 1단계)

## 2026-11-18
- 기술 검토(`tech-review.md`) → 결정: 영어, 뉴스=Bit, 개념 글=2단계 마크다운 Note
- `/specify`로 스펙 작성, L2 리뷰어 10건·Gemini 스펙 리뷰 12건 반영 후 승인
- Pre-work: PR #20(tech-scrap) — 운영 DB `db push`(추가만: SourceType enum, scrap_drafts) 후 squash merge (`a5b880c`)
- 구현 (`feature/news-curation`)
  - T1 스키마: FeedItem·FeedItemStatus·DraftKind, ScrapDraft(kind, sourceLabel, warnings, feedItemId) / scrap-drafts: createNewsDraft(트랜잭션), deleteExpiredNewsDrafts, getDrafts({kind})
  - T2 linkify + parseTags URL 제외 + BitCard 링크 (서브에이전트)
  - T3 news-sources(11) + news-feed(RSS/Atom, normalizeUrl, cleanUrl, 10s/5MB/동시4) (서브에이전트)
  - T4 news-ai(Haiku 채점, Sonnet 생성) + news-compose(조립·URL 제거·태그 정제·금지어·숫자 검사) (서브에이전트)
  - T5 news-curate 오케스트레이터 + Prisma store + `scripts/curate.ts` (`--dry-run`)
  - T6 /scrap News inbox + 만료 표시 + e2e(`e2e/news-inbox.spec.ts`)
  - T7 `.github/workflows/curate.yml`(06·18시 KST), CI dry-run 스텝, ESLint import 가드
- Gemini diff 리뷰 12건 → 9 반영, 3 기각 (`gemini-diff-review.md`, spec Implementation Notes)
- 검증: unit 172/172, tsc, eslint, dry-run 통과. e2e는 로컬 Docker 없어 CI에서 확인 예정

- 2026-11-18 추가: PR #21(오너 세션 쿠키 서명) 머지 `97b05d8`. CI 러너 ubuntu-24.04 고정(Playwright가 26.04 미지원).
- AI 백엔드를 Claude Code CLI(구독 토큰)로 전환 — `news-ai-cli.ts`, curate.yml. 로컬 CLI 실호출로 채점·생성 확인.

## 남은 일
- PR 머지 직전 운영 DB `db push` (feed_items, scrap_drafts 컬럼 추가)
- GitHub `production` Environment + secrets(DATABASE_URL=Session Pooler, CLAUDE_CODE_OAUTH_TOKEN=`claude setup-token`)
- 머지 후 workflow_dispatch 1회 수동 실행
