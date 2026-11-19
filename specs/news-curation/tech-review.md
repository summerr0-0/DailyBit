# 기술 검토: AI·최신기술·보안 자동 큐레이션 + 동적 용어 사전

> Date: 2026-11-18 · 상태: 검토 완료, 결정 확정

## 확정 결정 (2026-11-18)
- 출력 언어: **영어** (포트폴리오·scrap-ai와 일관, 원문 영어라 번역 왜곡 없음). 타깃은 영어권 입문자·포트폴리오 방문자로 바뀜.
- 뉴스: **기존 Bit** (GeekNews식 개조식, 500자 이내)
- 개념 글: **새 마크다운 Note 모델** `/notes/[slug]` (Concept 테이블은 Note.aliases로 흡수). react-markdown + remark-gfm + rehype-sanitize 필수.
- MVP 순서: ① 뉴스 Bit 자동 수집 → ② Note(마크다운) 모델·페이지 → ③ 뉴스↔개념 연결 + 개념 초안 자동 생성

## 결론
실현 가능. 기존 tech-scrap 파이프라인(extract → summarize → 비공개 ScrapDraft → 컨펌 발행)을 그대로 재사용할 수 있다.
새로 만들 것은 (1) 자동 수집 러너 (2) 중복 제거·필터 (3) Concept 링크 체계 세 가지.
다만 기획서는 "마크다운 파일 + slug 블로그"를 전제로 해서 DailyBit 구조와 세 군데가 어긋난다.

## 먼저 결정할 것 (기획서 ↔ DailyBit 불일치)
| # | 기획서 전제 | DailyBit 현실 | 권장 |
|---|---|---|---|
| 1 | 긴 마크다운 글, `/blog/concepts/slug` | Bit 500자 plain text, Thread. 렌더러는 #해시태그만 링크화 (BitCard.renderContent) | 뉴스 = 단일 Bit(개조식 4줄이면 500자 안에 들어감), 개념 = Thread. 렌더러에 URL·개념 토큰 링크화 추가 |
| 2 | 한국어 초보자용 | 포트폴리오 English 전환, scrap-ai 출력 영어 고정 | 결정 필요. 섞으면 피드 일관성 깨짐 → 언어 통일 또는 한국어는 별도 태그/섹션 |
| 3 | 로컬 마크다운 파일 검수 | DB(ScrapDraft) + /scrap 워크벤치 | 파일 없이 ScrapDraft를 검수 큐로 사용 |

## 아키텍처 제안
- 러너: GitHub Actions schedule → `pnpm tsx scripts/curate.ts` 가 DB에 직접 ScrapDraft 생성.
  - Vercel Cron 비추천: 22개 피드 + LLM 여러 번 호출이 함수 타임아웃에 걸림. 로컬 launchd는 맥이 켜져 있어야 함.
- 스키마 추가
  - `FeedItem { urlNormalized @unique, sourceId, title, publishedAt, score, status(SEEN|SKIPPED|DRAFTED) }`
  - `Concept { slug @unique, term, aliases String[], threadId?, status(DRAFT|PUBLISHED) }`
  - `ConceptLink { bitId, conceptId }` — 역링크("관련 이슈 보기")는 본문에 쓰지 말고 DB에서 렌더 (500자 제한 + 매번 기존 글 수정 불필요)
  - `ScrapDraft` 확장: `kind(MANUAL|NEWS|CONCEPT)`, `feedItemId?`, `conceptSlugs String[]`

## 단계별 검토
### 1. 수집 — 소스 실측 (2026-11-18 curl)
| 소스 | 결과 | 조치 |
|---|---|---|
| Karpathy, Willison, Raschka, Interconnects, Import AI, One Useful Thing, OpenAI, DeepMind, Schneier, THN, Krebs, Dwarkesh, Latent Space, TLDR AI(`tldr.tech/api/rss/ai`) | 200 피드 OK | 그대로 |
| Ars Technica / The Register / Techmeme | 기획서 URL은 홈페이지 | `feeds.arstechnica.com/arstechnica/index`, `theregister.com/headlines.atom`, `techmeme.com/feed.xml` |
| HF Daily Papers | `/papers`는 HTML | `huggingface.co/api/daily_papers` (JSON, upvotes 포함) |
| Anthropic News | RSS 없음 (`/rss.xml` 404) | HTML 목록 파싱(깨지기 쉬움) 또는 Techmeme/HN으로 간접 포착 |
| BleepingComputer | 브라우저 UA 위장 시 403, 정직한 봇 UA 시 200 | 피드 요청은 `DailyBitFeedReader/1.0` 같은 정직한 UA 사용 (scrap-extract의 Chrome UA 위장과 분리) |
| Reddit r/LocalLLaMA | `.json`, `.rss` 모두 403 | OAuth 앱 등록 필요(API 약관). MVP에서 제외 권장 |
| HN Firebase API | 200 | 점수 필터용으로 사용 |

- 애그리게이터(Techmeme, HN, TLDR)는 원문 소스와 같은 기사를 또 가져온다. "처리한 URL 제외"만으로는 부족 → URL 정규화(utm·trailing slash·amp 제거) + 제목 유사도로 클러스터링.
- 팟캐스트: 1~2시간 대본은 `MAX_RAW_LENGTH=20000`에서 잘려 앞부분만 요약됨. 쇼노트만 쓰거나 제외.

### 2. 필터링
- 업보트 점수는 HN/HF/Reddit에만 있다. RSS 소스는 점수 없음.
- 규칙: 인물 블로그·공식 연구소 = 자동 통과 후보, 애그리게이터 = 점수 임계값, 그 위에 저가 모델(Haiku)로 제목+요약 관련도 채점.
- **하루 상한 3~5건 필수.** 1인 블로그에서 검수 큐가 쌓이면 파이프라인이 사실상 멈춘다. 가장 큰 운영 리스크.

### 3. 키워드 추출·기존 글 대조
- "초보자에게 생소한" 판단은 매번 흔들리고 동의어가 쏟아진다 (양자화 / Quantization / 4-bit quantization / GGUF) → 중복 개념 글 양산.
- 대책: Concept 테이블(canonical slug + aliases). 기존 Concept 목록을 프롬프트에 주고 "이 중에서 고르고, 없을 때만 새 slug 제안". alias 정확 일치를 코드로 먼저 확인. 실행당 신규 개념 1개 상한.
- 기존 DailyBit Thread는 "개념 글"로 표시돼 있지 않다 → 초기 백필(수동 지정) 필요.

### 4. 생성
- 환각: 예시 자체가 위험을 보여줌 — 원문 링크가 기사 아닌 BleepingComputer 홈, "최대 3배" 수치 출처 불명.
  - 원문 URL은 FeedItem에서 코드가 넣는다. LLM은 URL을 절대 쓰지 않고 concept slug만 반환, 링크는 코드가 조립.
  - 출력의 숫자가 rawExtract에 존재하는지 코드로 검사, 없으면 경고 표시.
- 프롬프트 인젝션: 크롤링 본문은 신뢰 불가 입력. LLM에 도구가 없고 결과가 비공개 초안이라 영향은 "조작된 문장/링크" 수준 → 위 URL 규칙 + 원문 구분자로 충분.
- 톤 규칙(금지 표현, `~함` 종결)은 프롬프트만 믿지 말고 금지어 정규식 린트로 후처리.
- 모델: scrap-ai 기본값 `claude-opus-4-8`은 구버전. 필터·키워드 = Haiku 5.5, 작성 = Sonnet 5.5/Opus 5.5로 계층화. 실시간이 아니므로 Batch API도 고려.
- 발행 순서: 뉴스가 아직 미발행인 개념 초안을 링크하면 깨진 링크 → 연결된 Concept이 PUBLISHED일 때만 링크 렌더(아니면 일반 텍스트).

### 5. 검수·발행
- 기존 /scrap 워크벤치에 "자동 수집 인박스" 목록 추가. 발행 로직(재검증, aiCollab=LED)은 재사용.

## 저작권·약관
- 요약 + 원문 링크 형태는 무난. 원문 전체 재게시 금지, rawExtract는 지금처럼 비공개 유지.
- Reddit은 API 약관상 OAuth 필수. 각 Bit에 출처 표기.

## MVP 순서
1. 언어·포맷 결정
2. FeedItem + 검증된 RSS 8~10개 + 중복 제거 + GH Actions cron → ScrapDraft(kind=NEWS), 개념 연결 없이
3. Concept 테이블 + 렌더러 링크화 + DB 역링크
4. 개념 초안 자동 생성
5. HN/HF/Anthropic 등 비RSS 소스 추가
