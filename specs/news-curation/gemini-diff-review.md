1. **[high] [src/lib/news-feed.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-feed.ts#L57-L72) (`normalizeUrl`, `rssLink`, `atomLink` — L57-72, L175-194) — 피드 항목 URL의 스킴 및 유효성 미검증 (보안/엣지케이스)**
   - `rssLink`의 `<link>` 경로와 `atomLink`는 URL 스킴이나 절대 URL 여부를 확인하지 않으며(`guid` 폴백에만 `/^https?:\/\//i` 검사가 있음), `normalizeUrl`도 `new URL()` 파싱 실패 시 원본 문자열을 그대로 반환하고 파싱 성공 시에도 `http:`/`https:` 스킴을 강제하지 않습니다.
   - 피드에 `javascript:` URL이 들어오면 `ScrapDraft.sourceUrl`로 저장되어 오너 UI(`<a href={draft.sourceUrl}>`)에서 클릭 시 XSS로 이어질 수 있고, 사설 IP/비정상 스킴이 `extract(item.url)`로 전달될 수 있으며, 상대 경로(예: `/posts/1`)가 들어오면 정규화 키 충돌 및 본문 내 깨진 링크가 생성됩니다.

2. **[high] [src/lib/news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L206-L234) (`runCuration` 채점 단계 — L206-234) — 60건 단일 배치 채점에서 단일 기사의 Refusal이 전체 큐레이션을 마비시킴 (엣지케이스)**
   - 보안·익스플로잇 피드를 포함한 최대 60개 기사를 한 번의 LLM 호출(`scoreItems`)로 묶어 채점하는데, 그중 1건의 제목·요약이 모델의 `stop_reason === "refusal"`이나 응답 잘림(`max_tokens`)을 유발하면 배치 전체가 `{ ok: false }`로 실패하고 DB에 아무것도 기록되지 않습니다.
   - 원인이 된 기사가 `SKIPPED`/`FAILED`로 기록되지 않으므로 다음 cron 실행에서도 동일한 기사가 다시 배치에 포함되어, 해당 기사가 48시간(`FRESH_WINDOW_MS`)이 지나 `stale`로 빠질 때까지 모든 신규 뉴스 채점이 멈춥니다.

3. **[med] [src/lib/news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L300-L306) (`resolveContent` — L300-306) — 이미 정제된 `item.summary`에 `htmlToText`를 중복 호출해 이중 디코딩 및 텍스트 유실 발생 (버그)**
   - `parseFeed` 시점에 이미 `htmlToText`를 거쳐 태그 제거와 엔티티 디코딩이 끝난 문자열이 `item.summary`에 저장됩니다(주석에도 "이미 태그 제거·엔티티 디코딩·절삭됨"이라 명시).
   - 그런데 `resolveContent`에서 `htmlToText(item.summary ?? "")`를 다시 호출하고 있어, 1차 디코딩으로 복원된 본문 내 꺾쇠 텍스트(예: `Array<string>`, `a < b > c`)가 2차 호출의 `/<[^>]*>/g`에 의해 HTML 태그로 오인·삭제되고, `&amp;lt;`가 `<`까지 이중 디코딩됩니다.

4. **[med] [src/lib/news-feed.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-feed.ts#L121-L147) (`htmlToText`, `XMLParser` 설정 — L121-147) — XML 파서의 엔티티 선디코딩으로 인해 본문/제목의 정상 `<...>` 텍스트가 삭제됨 (버그)**
   - `XMLParser`에 `processEntities: true`가 설정되어 있어 XML 기본 엔티티(`&lt;`, `&gt;`, `&amp;`)가 `htmlToText`에 들어가기 전에 이미 `<`, `>`로 변환됩니다.
   - 기술 블로그 피드의 제목이나 요약에서 제네릭 타입(`Vec<T>`), 수식(`x < y && y > z`), 태그 예시(`<items>`)가 `&lt;...&gt;`로 정상 이스케이프되어 있어도 XML 파서가 먼저 `<...>`로 풀어버린 뒤 `htmlToText`의 `/<[^>]*>/g`가 이를 HTML 태그로 취급해 삭제합니다.

5. **[med] [src/lib/news-expiry.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-expiry.ts#L9-L17) & [src/app/scrap/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/scrap/page.tsx#L22-L27) (`newsExpiryLabel`, `ScrapPage` — L9-17, L22-27) — 보관 기간이 지난 초안이 UI에 노출되며 `"expires in 1h"`로 잘못 표시됨 (버그)**
   - 만료 초안 삭제(`deleteExpiredNewsDrafts`)는 12시간 주기의 cron 스크립트에서만 실행되고, `getDrafts({ kind: "NEWS" })`는 조회 시 `createdAt` 만료 조건을 필터링하지 않습니다.
   - 게다가 `newsExpiryLabel`이 `Math.max(1, Math.floor(remaining / HOUR_MS))`로 최솟값을 1시간으로 고정하고 있어, 이미 3일이 지나 `remaining <= 0`인 초안도 다음 cron이 돌기 전까지 화면에 남고 `"expires in 1h"`로 표시됩니다.

6. **[med] [src/lib/news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L251-L262) (`runCuration` 생성 단계 — L251-262) — `checkNumbers`가 최종 초안이 아닌 절삭·URL 제거 전의 원본 LLM 출력을 검사함 (버그)**
   - `buildNewsBit`는 500자 초과 시 마지막 불릿들을 `pop()`으로 잘라내고 `stripUrls`로 LLM이 넣은 URL을 제거하지만, `checkNumbers`는 `buildNewsBit`의 결과가 아니라 원본 `gen.output.headline`과 `gen.output.bullets` 전체를 검사합니다.
   - 이로 인해 500자 제한으로 최종 초안에서 삭제된 불릿의 숫자나, `stripUrls`로 제거된 URL 안의 숫자(연도·ID 등)까지 `number_not_in_source` 경고를 발생시킵니다.

7. **[med] [src/lib/news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L237-L275) (`runCuration` 선정 및 본문/생성 루프 — L237-275) — 선정된 3건 중 본문 부족/생성 실패 시 차순위 후보 대체(Fallback) 없음 (엣지케이스)**
   - `selectForDrafting`으로 상위 3건(`MAX_DRAFTS_PER_RUN`)을 먼저 자른 뒤 본문 추출(`resolveContent`)과 요약 생성(`generate`)을 시도합니다.
   - 선정된 기사가 본문 200자 미만(`no_content`로 즉시 `SKIPPED`)이거나 생성에 실패하더라도 풀에 있는 차순위 후보를 당겨오지 않아 해당 실행의 초안 할당량이 그대로 유실됩니다.

8. **[med] [src/lib/news-feed.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-feed.ts#L149-L156) (`textOf`, `parseFeed` — L149-156, L205-231) — 빈 RSS/Atom 피드 및 Atom `type="xhtml"` 본문 파싱 실패 (엣지케이스)**
   - 항목이 없는 빈 피드(`<rss><channel/></rss>` 또는 `<feed/>`)는 `fast-xml-parser`에서 `channel`이나 `feed`가 빈 문자열(`""`)로 파싱되어 분기를 타지 못하고 `"Not an RSS 2.0 or Atom document"` 에러를 던집니다.
   - 또한 Atom 피드에서 `<content type="xhtml"><div>...</div></content>`처럼 인라인 XHTML 트리 형태로 본문을 제공하는 경우 `entry.content`가 중첩 객체로 파싱되어 `textOf`가 `#text`만 읽고 본문 전체를 빈 문자열로 날립니다.

9. **[low] [src/lib/linkify.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/linkify.ts#L5-L54) (`URL_PATTERN`, `trimUrl`, `splitByUrls` — L5, L19-54) — 닫는 괄호/문장부호 뒤에 공백 없이 해시태그나 텍스트가 붙을 때 URL 경계 오판 (엣지케이스)**
   - `URL_PATTERN`(`/https?:\/\/[^\s<>"']+/g`)이 공백 전까지 한 번에 매치한 뒤 `trimUrl`이 매치된 문자열의 **맨 끝**에서만 `)`와 문장부호를 떼어냅니다.
   - 따라서 `(https://example.com/post)#ai`나 `(https://example.com)에서`처럼 닫는 괄호 뒤에 공백 없이 태그나 조사가 이어지면 `trimUrl`이 괄호를 제거하지 못해 뒤쪽 텍스트까지 통째로 하나의 URL로 묶이고 `#ai` 태그 추출도 누락됩니다.

10. **[low] [src/lib/news-feed.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-feed.ts#L57-L72) & [src/lib/news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L252-L263) (`normalizeUrl`, `runCuration` — L57-72, L252-263) — 중복 제거 키용 `urlNormalized`를 실제 게시물 본문 링크로 사용해 링크 파손 가능 (버그)**
    - `normalizeUrl`은 중복 비교를 위해 호스트의 `www.`와 경로 끝 슬래시(`/`)를 무조건 제거하는데, `buildNewsBit`에 원본 URL이 아닌 `item.urlNormalized`를 넘겨 게시물 본문 링크로 박고 있습니다(반면 `ScrapDraft.sourceUrl`에는 추적 파라미터가 제거되지 않은 `item.url`을 저장).
    - `www.` 서브도메인만 운영하거나 끝 슬래시 유무에 민감한 사이트의 경우 발행된 Bit 본문의 링크가 깨질 수 있습니다.

11. **[low] [src/lib/news-compose.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L17-L31) (`URL_TOKEN`, `stripUrls` — L17-31) — `stripUrls`가 URL 바로 뒤에 붙은 닫는 괄호나 문장 마침표까지 삭제함 (엣지케이스)**
    - `linkify.ts`의 `trimUrl`과 달리 `stripUrls`는 `/(?:https?:\/\/|www\.)\S+/giu`로 공백 아닌 문자를 끝까지 치환하므로, LLM이 `"Released v2 (https://example.com)."`처럼 괄호나 마침표를 붙여 출력하면 닫는 괄호와 마침표까지 지워져 `"Released v2 ("`처럼 문장이 깨집니다.

12. **[low] [src/lib/news-compose.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L116-L128) (`NUMBER_TOKEN`, `checkNumbers` — L116-128) — 나열된 숫자의 쉼표까지 제거하여 존재하지 않는 숫자로 합쳐 검사함 (엣지케이스)**
    - `NUMBER_TOKEN`(`/\d[\d.,]*\d|\d/gu`)은 천 단위 구분자뿐 아니라 공백 없이 쉼표로 이어진 숫자(예: `"tier 1,2"`, 유럽식 소수점 `"1,5"`)나 범위 점(`"1..3"`)도 단일 토큰으로 매치한 뒤 쉼표를 제거해 `"12"`, `"15"`로 바꾸므로, 원문에 `"1"`과 `"2"`가 각각 있어도 `number_not_in_source:12` 오탐 경고가 발생합니다.
