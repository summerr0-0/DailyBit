# 테크 글 스크랩 기능 — Worklog

## 목표

Irin이 준 개발 글(URL/유튜브/텍스트)을 AI가 요약·정리해 **비공개 draft**로 만들고,
Irin이 컨펌하면 Bit(길면 Thread)로 발행한다. 흘려보냈을 학습을 손쉽게 기록으로 남기는 것이 목적.

관련 문서: `specs/tech-scrap/spec.md`(L0~L4 스펙), `specs/tech-scrap/insights.md`(딥 인터뷰).

## 구현 범위

### 스키마 (prisma/schema.prisma)
- `SourceType` enum(URL/TEXT/YOUTUBE) 추가
- `ScrapDraft` 모델 추가: sourceType, sourceUrl?, sourceTitle?, rawExtract(Text), segments(Json), suggestedThreadTitle?(≤100), authorId, timestamps
- `User`에 `scrapDrafts ScrapDraft[]` 역관계
- draft는 컨펌 발행/폐기 시 삭제되는 임시 데이터 (비공개, 오너 전용)

### 서비스 lib
- `src/lib/scrap-extract.ts` — URL은 readability로 본문 추출, 유튜브는 자막(youtube-transcript), 텍스트는 정규화. 로그인 벽/빈 본문(트위터·링크드인 등)은 `fetch_failed`로 반환해 상위에서 수동 텍스트 fallback 유도. 실패는 예외가 아니라 `{ ok: false, reason }`.
- `src/lib/scrap-ai.ts` — Anthropic Claude 호출로 충실한 요약 + 쉬운 설명을 **영문**·절제 톤으로 생성. `output_config.format`(json_schema)로 세그먼트 배열 구조화. 각 세그먼트 ≤500자 방어 절삭, 개수 상한 8, 실패/빈 출력은 `{ ok: false }`(부분 draft 없음). 클라이언트는 지연 생성(빌드 시 API 키 불요).
- `src/lib/scrap-drafts.ts` — draft CRUD + 발행. 발행 시 각 세그먼트 1~500자 재검증, 1개→`createBit`, 2개↑→`createThread`+`createBit`(모두 `aiCollab=LED`), 성공 시 draft 삭제.

### API 라우트 (전부 requireAuth)
- `POST /api/scrap/extract` — 추출. 성공 200, fetch 실패/자막 없음 422 `{reason,message}`, 잘못된 입력 400
- `POST /api/scrap/summarize` — AI 요약. 성공 200 `{segments, suggestedThreadTitle}`, AI 실패 502
- `GET·POST /api/scrap/drafts` — 오너 draft 목록/생성
- `DELETE /api/scrap/drafts/[id]` — 폐기(204/404)
- `POST /api/scrap/drafts/[id]/publish` — 발행(201 `{kind,id}`, 초과 400+index)

### UI
- `src/app/scrap/page.tsx` — 오너 전용 서버 컴포넌트(비오너에겐 안내만). 초기 draft를 서버에서 로드.
- `src/components/scrap/ScrapWorkbench.tsx` — "use client". URL 입력→추출→요약→draft 생성 플로우, 422 시 텍스트 fallback 노출. draft 카드: 세그먼트별 편집 textarea + 500자 카운터(초과 시 발행 비활성) + 세그먼트 삭제 + Thread 타이틀 편집 + 발행/폐기.

## 기술 결정

- **입력 파이프라인**: 기본 URL → fetch 실패 시 시스템 알림 + Irin이 텍스트 붙여넣기 fallback. 트위터/링크드인 자동 스크랩은 로그인 벽으로 불가하여 v1 제외, 스크린샷 OCR은 v2.
- **결과물 언어 = 영어** (포트폴리오 English 전환과 일관, "번역"의 정체는 영문 산출물).
- **500자 강박 해소**: AI가 세그먼트 배열을 반환 → 1개는 Bit, 2개 이상은 주제 관통 Thread. 사람이 컨펌 전 편집.
- **draft = 별도 ScrapDraft 모델**: 원본URL·추출원문 등 발행 Bit에 없는 메타를 임시 보관, Bit 스키마 오염 방지. 발행 시 1회 매핑 후 삭제.
- **AI 프로바이더 = Anthropic Claude**, 서버 Route Handler에서 호출. 기본 모델 `claude-opus-4-8`, `SCRAP_AI_MODEL` 환경변수로 오버라이드(예: 비용 위해 `claude-sonnet-5`).

### 스펙 대비 변경
- `ScrapDraft.segments`를 스펙의 `[{content, tags}]` 대신 **`string[]`**로 저장. 태그는 각 세그먼트 본문 인라인 `#hashtag`로 넣어 기존 `parseTags`/`createBit` 경로가 그대로 뽑도록 함 — 더 단순하고 "#태그는 본문에" 도메인 관례와 일치.

## 검증 결과

- `pnpm typecheck` (tsc --noEmit): 오류 없음
- `pnpm lint` (eslint): 통과
- `pnpm build` (prisma generate + next build): 성공, `/scrap` 및 `/api/scrap/*` 라우트 모두 컴파일
- `pnpm test:run` (vitest): 52개 전부 통과 (기존 테스트 회귀 없음)

## 미완료 / 후속 (외부 작업)

- **DB push 필요**: Docker 미기동으로 로컬 DB 미반영. `pnpm db:dev:up && pnpm db:push:local` 후 Supabase에도 마이그레이션 적용.
- **`ANTHROPIC_API_KEY`** 를 `.env.local`(로컬)·Vercel 환경변수(배포)에 설정. `.env` 편집이 훅으로 차단되어 코드에서 처리 불가.
- 위 완료 후 `/scrap` 실제 종단 확인(추출→요약→발행).

## Known Gaps (spec 참조)

- 성공 기준 정량화 미정(행동 신호만), AI 비용 캡 미도입, 유튜브 비영어 자막 세부 처리, 한국어 소스→영문 변환 범위.
