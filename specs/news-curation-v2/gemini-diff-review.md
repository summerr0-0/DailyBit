1. **[high] `src/lib/news-curate.ts:470-519` — 사건 초안 저장 성공 후 개념 처리 중 예외 발생 시 이미 `DRAFTED`된 기사들을 `FAILED`로 되돌리는 버그**
   - `store.createEventDraft`가 성공해 `NewsEvent(OPEN)`와 `ScrapDraft`가 커밋되고 출처 `FeedItem`들이 `DRAFTED`로 변경된 뒤, 같은 `try` 블록의 후속 개념 처리(`ensureConceptLinked`, `generateConcept`, `createConceptDraft`, `findConcepts`)에서 예외가 발생하면 바깥 `catch` 블록이 모든 출처 `FeedItem`에 `recordFailure`를 실행합니다.
   - 그 결과 이미 초안이 만들어진 기사들이 `FAILED` 상태로 덮어써져 다음 실행의 `findPool()`에 다시 잡히고, 늦은 출처(late source) 경로를 통해 자기 자신의 초안에 중복 추가됩니다(`findOpenEventDraft`도 `status: "DRAFTED"`인 `FeedItem` 수만 세므로 `MAX_SOURCES_PER_EVENT` 제한까지 우회됨).

2. **[high] `src/lib/scrap-drafts.ts:445-560` — `publishDraft`의 트랜잭션·원자적 선점 부재로 인한 중복 발행, 경합 덮어쓰기 및 고아 데이터 생성**
   - 초안 존재 확인(`findUnique`) 및 버전 검사(`isStale`)를 트랜잭션 밖에서 먼저 수행한 뒤 Thread와 Bit들(개념 발행 시 백링크 Bit들 포함)을 생성하고, 맨 마지막에야 `scrapDraft.deleteMany`를 실행합니다.
   - 동시 발행 요청(더블 클릭 등) 시 두 요청 모두 초기 검사를 통과해 동일한 Thread와 Bit가 중복 발행됩니다. 또한 `isStale` 통과 직후 cron(`appendSourceToDraft`·`expireDrafts`)이 초안을 갱신하더라도 마지막 `deleteMany`에는 `updatedAt` 조건이 없어 변경된 초안을 그대로 삭제하며, Bit 생성 도중 에러가 나면 이미 생성된 Thread와 일부 Bit가 롤백되지 않고 고아 상태로 남습니다.

3. **[high] `src/lib/news-curate.ts:301, 364-375, 484-488` (및 `src/lib/news-curate-store.ts:66-72`) — `recentEvents` 범위(7일·최대 100건) 밖의 기존 `eventKey`와 충돌할 때 후보 기사가 48시간 동안 매 실행 실패를 반복하는 버그**
   - `findRecentEvents`는 `updatedAt >= now - 7d` 및 `take: 100`만 조회하므로, 7일이 지났거나 100건 밖으로 밀려난 과거 `NewsEvent`와 동일한 `eventKey`가 부여되면 `eventStatus`에 없어 `newEventGroups`로 들어갑니다.
   - 이후 `generateEvent`(Sonnet 호출)까지 수행한 뒤 `createEventDraft`에서 DB unique 제약으로 `EventKeyConflictError`가 발생하는데, catch 블록에서 기사 상태를 변경하지 않고(`CANDIDATE` 유지) 넘어가므로 `markStale`(48시간)이 될 때까지 매 실행마다 Sonnet 비용과 사건 작성 슬롯을 소모하며 무한 재시도합니다.

4. **[med] `src/lib/scrap-drafts.ts:280-303` (및 `src/lib/news-curate.ts:493-510`) — Prisma `createConceptDraft`에서 AI가 생성한 개념 별칭(`aliases`)이 DB에 전혀 저장되지 않는 버그**
   - `runCuration`이 `store.ensureConceptLinked`를 먼저 호출해 `Concept` 행을 생성한 뒤, `generateConcept`가 반환한 `cg.output.aliases`를 합쳐 `store.createConceptDraft`에 전달합니다.
   - 인메모리 스토어(`news-curate.ts:758`)는 `c.aliases = input.aliases`로 갱신하지만, 실제 Prisma 구현인 `createConceptDraft`는 `tx.concept.upsert`의 `update: {}`가 비어 있고 후속 `tx.concept.update`에서도 `draftId`만 업데이트하므로 `generateConcept`가 만든 별칭과 만료 후 재생성된 개념의 별칭이 DB에서 100% 유실됩니다(마찬가지로 `ensureConceptLinked`도 기존 개념 매칭 시 새로 들어온 `aliases`를 병합하지 않음).

5. **[med] `src/lib/news-ai.ts:32-34, 251, 320-331, 439, 458-466` — 비신뢰 외부 기사 제목이 신뢰 경계 태그(`<sources>`, `<article>`) 바깥에 삽입되어 프롬프트 인젝션 방어 우회 가능**
   - 시스템 프롬프트는 `<sources>`와 `<article>` 내부만 비신뢰 데이터로 지정하고 있으나, `generateEventNews`와 `generateSourcePoint`는 외부 RSS에서 가져온 `eventTitle`(`lead.title`)과 `source.title`을 해당 태그 바깥의 최상위 영역(`Event: ...`, `Title: ...`)에 삽입합니다.
   - `escapeDelimiters`는 지정된 XML 여닫는 태그만 치환할 뿐 줄바꿈이나 일반 텍스트 지시문을 막지 못하므로, 기사 제목에 줄바꿈과 명령문을 넣으면 비신뢰 데이터 블록 바깥의 지시문으로 해석될 수 있습니다.

6. **[med] `src/lib/scrap-drafts.ts:486-560` — 뉴스 초안과 개념 초안 동시 발행 시 양방향 링크 Bit가 모두 누락되는 경합**
   - `publishEventDraft`는 시작 시점에 `PUBLISHED` 개념을 조회하고 Thread/Bit 생성이 끝난 뒤에야 `NewsEvent`를 `PUBLISHED`로 바꾸며, `publishConceptDraft`도 시작 시점에 `PUBLISHED` 사건을 조회하고 맨 끝에 `Concept`를 `PUBLISHED`로 바꿉니다.
   - 연결된 뉴스 초안과 개념 초안이 동시에 발행되면 양쪽 모두 상대방을 발행 전 상태(`OPEN`/`PENDING`)로 읽어, 뉴스 Thread 끝의 개념 링크 Bit와 개념 Thread의 `Related news`·백링크 Bit가 양쪽 모두에서 누락됩니다.

7. **[med] `src/components/scrap/ScrapWorkbench.tsx:185, 203` (및 `src/lib/scrap-drafts.ts:465-473`) — 세그먼트를 1개로 편집한 v2 뉴스·개념 초안 발행 시 Thread 제목이 본문으로 덮어써지는 버그**
   - 서버(`publishDraft`)는 v2 `NEWS`(`eventKey` 존재)와 `CONCEPT` 초안을 세그먼트 수와 무관하게 항상 Thread로 발행하지만, 클라이언트 `DraftCard`는 `segments.length >= 2`일 때만 `isThread`로 판단해 세그먼트가 1개면 `threadTitle: null`을 보냅니다.
   - 사용자가 편집 중 세그먼트를 1개로 합쳐 발행하면 기존 `suggestedThreadTitle`이 사라지고 `segments[0]` 본문(불릿·해시태그 포함)이 Thread 제목으로 들어갑니다.

8. **[med] `src/lib/news-curate.ts:547-550` — `planConcepts`에서 정규화 결과가 빈 문자열이 되는 별칭(`aliases`)으로 인한 오매칭 버그**
   - `c.aliases.map(normalizeConceptSlug)`와 `e.aliases.some((a) => candidates.includes(normalizeConceptSlug(a)))`에서 빈 문자열(`""`)을 필터링하지 않습니다.
   - 추출된 개념과 기존 개념 양쪽의 `aliases`에 영숫자가 없는 문자열(기호·비라틴 문자 등, 정규화 시 `""`)이 하나라도 있으면 `""`끼리 일치하여 전혀 다른 기존 개념에 매칭되거나 `REJECTED` 개념으로 취급되어 버려집니다.

9. **[med] `src/lib/scrap-drafts.ts:272-310, 333-342, 366-370` — 늦은 출처 추가 시 `NewsEvent.updatedAt` 미갱신 및 `deleteDraft`·`createConceptDraft`의 경합 예외 처리 누락**
   - `appendSourceToDraft`가 `ScrapDraft.updatedAt`만 갱신하고 `NewsEvent.updatedAt`은 갱신하지 않아, 늦은 출처로 초안 수명이 연장되어도 `findRecentEvents`(7일 기준) 및 개념 발행 시 관련 뉴스 최신순 정렬(`orderBy: { updatedAt: "desc" }`)에 반영되지 않습니다.
   - `deleteDraft`에서 `tx.newsEvent.updateMany`에는 `status: "OPEN"` 조건이 있으나 `tx.concept.updateMany`에는 상태나 `draftId: id` 조건이 없어 경합 시 이미 `PUBLISHED`된 개념을 `REJECTED`로 덮어쓸 수 있으며, `createConceptDraft`는 `createEventDraft`와 달리 동시 실행 시의 unique 제약 위반(`P2002`)을 `ConceptNotEligibleError`로 변환하지 않습니다.

10. **[low] `src/lib/news-curate.ts:427-434, 468` — 사건 본문 추출 대상 사전 절삭(`slice(0, 3)`) 및 출처 포인트(`segments[1..]`) 숫자 환각 검사 누락**
    - `group.items.slice(0, MAX_SOURCES_PER_EVENT)`로 먼저 3개를 자른 뒤 본문을 추출하므로, 상위 3개 중 `no_content`가 나오면 같은 사건의 4번째 후보 기사가 풀에 있어도 종합 초안에 쓰지 못하고 다음 실행의 늦은 출처로 밀려납니다(상위 3개 모두 `no_content`면 4번째 기사는 시도조차 안 하고 사건 작성이 스킵됨).
    - 또한 `checkNumbersMulti`를 요약 세그먼트(`built.segments[0]`)에만 적용하고 `generateEventNews`·`generateSourcePoint`가 생성한 출처별 `point`(`segments[1..]`)에는 적용하지 않아 출처 설명의 숫자 환각 경고가 누락됩니다.

11. **[low] `src/components/scrap/NewsInbox.tsx:24-26, 65` — 개념 초안 발행·폐기 후 뉴스 카드의 개념 상태 배지가 갱신되지 않는 UI 불일치**
    - `conceptStatuses`를 초기 props 기반의 고정 `Map`으로만 유지하고 있어, 같은 화면에서 개념 초안을 발행하거나 폐기해 카드가 사라져도 상단 뉴스 카드의 개념 배지는 새로고침 전까지 `"(draft pending)"`으로 남아 실제 발행 시 링크 부착 여부와 다르게 표시됩니다.

12. **[low] `src/lib/news-expiry.ts:21` & `src/lib/draft-hooks.ts:119, 125` — 만료 판정 함수·TTL 상수 중복 정의 및 경계 조건(`>=` vs `>`) 불일치**
    - 동일한 TTL 상수와 만료 판정이 두 파일에 중복 정의되어 있으며, `isNewsDraftExpired`는 `>=`를 쓰는 반면 `isDraftExpired`와 `expiryCutoffs`(`updatedAt < cutoff`)는 `>`를 사용하여 정확히 경계 시각일 때 판정이 일치하지 않습니다.
