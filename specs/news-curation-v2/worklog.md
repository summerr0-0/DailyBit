# Worklog: news-curation-v2

## 2026-11-19
- 계기: 1단계 운영 첫 초안 3건 중 2건이 같은 사건(OpenAI 공지 + Simon Willison), 초보자 개념 연결 없음 → 사용자 지적 "수집 → 검토 → 종합 작성 순서가 아니냐", "출처는 Thread로"
- `/specify`: 결정 13개(+D14 Gemini 반영 10건), 요구사항 34개, 태스크 6개. L2 리뷰어 10건, Gemini 스펙 리뷰 10건 반영
- 구현 (`feature/news-curation-v2`)
  - T1 스키마: NewsEvent, Concept, ConceptEvent, DraftKind.CONCEPT, FeedItem/ScrapDraft eventKey·conceptSlugs·conceptId (추가 전용)
  - T2 news-ai: 채점+사건 키, 사건 종합 작성, 개념 작성, 늦은 출처 포인트 / news-events 정규화 (서브에이전트)
  - T3 news-compose: buildNewsThread·buildSourceBit·buildConceptThread·checkNumbersMulti (서브에이전트)
  - T4 scrap-drafts: createEventDraft·createConceptDraft·appendSourceToDraft(낙관적 잠금)·kind별 발행/폐기/만료 훅, draft-hooks(순수), 409 (서브에이전트)
  - T5 news-curate v2 오케스트레이터 + Prisma store + dry-run(2출처 → Thread 1건 + 개념 초안)
  - T6 인박스: 사건 카드(출처 수·개념 상태), Concepts 섹션, 409 다시 불러오기; Thread 페이지도 BitCard와 같은 렌더러(링크화)
- Gemini diff 리뷰 12건 → 10 반영(발행 원자적 선점, 초안 후 개념 오류가 기사 되돌리지 않음, 오래된 사건 키 사전 확인, 별칭 저장, 제목을 비신뢰 블록 안으로 등), 2건 알려진 한계(동시 발행 링크 누락 경합, 인박스 배지 즉시 갱신)
- 실측: 운영 GPT-6.2 두 출처 원문으로 로컬 CLI 실행 → 종합 Thread 1건 + 개념 "cached input" 설명 정상
- 검증: unit 249, tsc, eslint, dry-run

## 2026-11-20 운영 반영 + 사건 묶기 개선
- 운영 DB 추가 전용 SQL 적용(DROP 0, 차이 0 확인) 후 #26 머지(`5479057`). 첫 실행: 사건 3건(TfL 유출, PHP phpAfterShell, PHP 7개 취약점) + 개념 2건(gadget chain, deserialization)
- **Vercel 운영 배포가 #26에서 실패**(19:07Z) — 로컬 `pnpm build`는 성공. 그 사이 오너가 옛 코드(#25)로 발행 → NewsEvent가 OPEN·없는 draftId로 남음, 개념 링크 훅 미실행
- 사용자 지적: PHP 두 건(+v1 BleepingComputer "18 flaws")이 같은 PHP 보안 릴리스 → 사건 묶기 개선 (`fix/event-grouping`)
  - 채점 프롬프트: "한 릴리스·패치 묶음은 기사가 다른 부분을 다뤄도 하나의 사건, 키는 릴리스 이름으로" + PHP 예시 → 실측: 두 PHP 기사가 `php-security-release-2026-11`로 묶임
  - 작성 전 병합 확인 `mergeEvents`(Haiku 1회): 새 사건 후보 상위 15 + 인박스 열린 사건 → 합칠 쌍, 체인 펼침, 실패 시 그대로 진행 → 실측: PHP 3건만 병합, TfL·OpenAI·Anthropic은 유지
