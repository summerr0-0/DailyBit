변경사항에서 확인된 버그·보안·엣지케이스 8건입니다.

---

### 1. [보안/접근권한 | 중간] 비로그인 방문자에게 전체 Thread·개념 링크 사전이 RSC Payload로 노출됨
- **위치**: `src/app/threads/[id]/page.tsx:13, 119`, `src/lib/link-targets.ts:8-29`
- **내용**: `/api/link-targets`는 `requireAuth()`로 막았지만, `ThreadPage`(Server Component)가 `"use client"` 컴포넌트인 `EditableBitContent`에 `links` 전체 객체(`getLinkTargets()`)를 prop으로 전달합니다. 비로그인 방문자(`owner === false`)에게도 모든 Thread의 정규화된 제목과 `threadId` 매핑 전체가 RSC 직렬화 페이로드로 클라이언트에 노출됩니다. 비공개 Bit만 담긴 Thread가 있을 경우 제목과 ID가 유출됩니다.

### 2. [버그 | 높음] 일반 객체(`{}`) 사용으로 인한 `Object.prototype` 프로퍼티 충돌
- **위치**: `src/lib/link-targets.ts:16-25`, `src/components/bits/bit-content.tsx:81`
- **내용**: `targets`가 `Object.create(null)`이 아닌 일반 객체 `{}`입니다.
  1. 본문에 `[[constructor]]`, `[[toString]]`, `[[valueOf]]`, `[[__proto__]]` 등을 입력하면 `links?.[linkKey(tok.target)]`가 `Object.prototype`의 프로퍼티(truthy)를 반환하여 `<Link href="/threads/function Object() { [native code] }">` 같은 깨진 링크가 생성됩니다.
  2. 실제 Thread 제목이나 개념 이름이 `"constructor"`, `"toString"` 등일 경우 `!(k in targets)`가 항상 `false`가 되어 링크 대상에서 누락됩니다.

### 3. [버그 | 높음] 첫 줄이 빈 줄이고 커서가 맨 앞(`0`)일 때 `toggleHeading`이 텍스트를 깨뜨림
- **위치**: `src/components/bits/text-format.ts:30-31`
- **내용**: `value.lastIndexOf("\n", cursor - 1)`에서 `cursor === 0`이면 두 번째 인자가 `-1`이 되는데, JS의 `String.prototype.lastIndexOf`는 음수 인덱스를 `0`으로 취급합니다. 만약 첫 줄이 빈 줄(`value[0] === "\n"`)이고 커서가 `0`에 있으면 `lastIndexOf("\n", -1)`이 `-1`이 아니라 `0`을 반환해 `lineStart = 1`, `lineEnd = 0`으로 역전됩니다. 그 결과 `value.slice(0, 1) + "# " + value.slice(0)`이 되어 첫 줄이 아닌 둘째 줄에 `# `가 들어가고 개행(`\n`)이 중복 복사됩니다.

### 4. [버그 | 중간] `getBacklinks`가 DB에서 단순 최신 200건만 조회 후 메모리 필터링하여 백링크가 누락됨
- **위치**: `src/lib/link-targets.ts:57-66`
- **내용**: `where: { content: { contains: "[[" } }`와 `take: 200`으로 전체 Bit 중 `[[`가 들어간 최신 200개만 가져온 뒤 JS에서 `extractLinkKeys`로 대상 `threadId` 여부를 필터링합니다. 뉴스 요약 AI가 매 요약마다 개념어를 `[[...]]`로 감싸므로 전체 `[[` 포함 Bit가 200개를 넘기면, 이전에 작성된 백링크들이 최신 200개 밖으로 밀려나 `Linked from`에서 사라집니다.

### 5. [버그/스펙 불일치 | 중간] 스펙 D1 '공백 무시 일치' 미구현 및 유니코드 정규화 불일치
- **위치**: `src/lib/wiki-links.ts:8-10`, `src/lib/news-compose.ts:263`
- **내용**:
  1. 스펙 D1은 "대소문자·공백 무시 일치"를 정의했으나, `linkKey`는 `.replace(/\s+/g, " ")`로 공백을 1칸으로 축약만 하고 제거하지 않아 띄어쓰기 유무가 다른 링크(예: `[[위키 링크]]` vs `[[위키링크]]`)를 매칭하지 못합니다.
  2. `keepAllowedWikiLinks`(`src/lib/news-compose.ts:263`)는 `linkKey`를 쓰지 않고 자체 정규화를 하면서 `.normalize("NFC")`를 누락해, NFD 한글 등이 들어올 때 `linkKey`와 판정이 어긋납니다.

### 6. [버그 | 중간] 뉴스 요약의 기존 개념(`<known_concepts>`) 및 한도 초과 개념의 `[[ ]]` 링크가 삭제됨
- **위치**: `src/lib/news-curate.ts:507-513`, `src/lib/news-ai.ts:339`
- **내용**:
  1. 프롬프트(`news-ai.ts:339`)는 `concepts` 배열에 넣은 용어뿐 아니라 본문에 사용한 모든 `<known_concepts>` 용어도 `[[...]]`로 감싸도록 지시합니다. 그러나 `linkTerms`는 `gen.output.concepts`만을 입력으로 받는 `plan.link`와 `plan.draft`에서만 추출하므로, AI가 `gen.output.concepts`(0~2개 제한)에 넣지 않고 본문에만 쓴 `<known_concepts>` 링크는 `keepAllowedWikiLinks`에 의해 괄호가 벗겨집니다.
  2. 실행당 새 개념 초안 한도(`MAX_CONCEPT_DRAFTS_PER_RUN`)에 걸려 `plan.draft`에서 잘린 개념어도 `linkTerms`에서 빠져 괄호가 제거되므로, 추후 그 개념이 발행되어도 스펙 D2(발행 시 자동 링크 전환)가 작동하지 않습니다.

### 7. [버그/엣지케이스 | 중간] `**[[링크]]**` 볼드 깨짐, CRLF 개행 시 `# 제목` 미동작, 제목 위 이중 줄바꿈
- **위치**: `src/components/bits/bit-content.tsx:73-97, 99, 108-129`
- **내용**:
  1. **인라인 서식 중첩 깨짐**: `renderLine`이 `splitWikiLinks`를 먼저 수행한 뒤 남은 텍스트 조각별로 `renderBoldAndTags`를 호출합니다. 따라서 `**[[개념]]**`이나 `**중요 [[개념]] 정리**`처럼 굵은 글씨 안에 위키 링크가 있으면 여는 `**`와 닫는 `**`가 서로 다른 텍스트 조각으로 쪼개져 볼드가 풀리고 `**` 기호가 그대로 노출됩니다.
  2. **CRLF 개행**: `HEADING_PATTERN = /^(#{1,3}) (.+)$/`에서 `.`은 `\r`을 매칭하지 않으므로, `\r\n` 개행이 포함된 본문에서는 줄 끝 `\r` 때문에 제목 서식이 전혀 인식되지 않습니다.
  3. **제목 위 빈 줄 추가**: 일반 줄 다음에 제목 줄이 올 때, 앞선 일반 줄이 끝에 `"\n"`을 추가(`lines.length - 1` 미만)하고 부모 `<p>`는 `whiteSpace: "pre-wrap"`이므로 개행이 한 번 일어나는데, 이어지는 제목 `<span>`이 `display: "block"`이라 줄바꿈이 한 번 더 일어나 제목 위에 의도치 않은 빈 줄이 생깁니다.

### 8. [버그/엣지케이스 | 낮음] 자동완성 모듈 전역 캐시(`suggestionCache`) 갱신 불가 및 빈 목록 시 반복 실행
- **위치**: `src/components/bits/RichTextarea.tsx:11-17, 38-40, 69-78`, `src/lib/link-targets.ts:32-48`
- **내용**:
  1. `suggestionCache`가 모듈 스코프에 영구 캐싱되어, 같은 세션에서 새 Thread를 작성하거나 제목을 변경하거나 개념을 발행해도 새로고침 전까지 `[[` 자동완성 목록에 반영되지 않습니다. 일시적 네트워크/인증 실패 시에도 빈 배열 `[]`이 영구 캐싱됩니다.
  2. Thread와 발행된 개념이 0개이거나 요청이 실패해 `[]`가 반환되면 `suggestions.length === 0`이 유지되므로, `[[` 뒤에서 타이핑할 때마다(`query` 객체가 매번 새로 생성됨) `useEffect`가 매 키 입력마다 재실행됩니다.
  3. `getLinkSuggestions`에서 `concept` 조회 시 `getLinkTargets`와 달리 `threadId: { not: null }` 조건이 없고 `aliases`도 제외되어 있어, 별칭으로는 자동완성 검색이 되지 않으며 `threadId`가 없는 개념이 있을 경우 동일 제목의 Thread까지 `seen` Set으로 가려버립니다.
