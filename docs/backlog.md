# Backlog

DailyBit 개선 아이디어 모음. 우선순위·범위는 미정이며, 착수 시 `/specify`로 스펙을 작성한다.

## 기능

- [ ] **인용 Rebit (Quote Rebit)** — Rebit할 때 코멘트(멘트)를 덧붙여 공유한다. 트위터 인용 트윗처럼 원본 Bit를 카드로 감싸고 위에 내 글을 붙인다.
  - 현재 Rebit는 코멘트 없는 단순 리포스트 (`Rebit` 모델, spec `rebit`의 Non-goal이었음).
  - 데이터: `Rebit`에 `comment String?` 추가, 또는 인용은 별도 모델/Bit로 분리할지 결정 필요.
  - 피드: 인용 항목은 "내 코멘트 + 원본 Bit 카드 중첩" 형태로 렌더. 단순 Rebit("OO님이 Rebit함")와 구분.
- [ ] **UI 언어 영어화** — 현재 한국어 UI 텍스트를 영어로 변경. 단순 영어화 vs i18n 도입 여부 결정 필요.
- [ ] **본문 인라인 해시태그 링크화** — 본문 텍스트 안의 `#태그`를 인라인 링크로 렌더한다.
  - 예: 본문 `나의#일상` → `나의`는 일반 텍스트, `#일상`만 `/tags/일상` 링크.
  - 현재는 본문(`{bit.content}`)이 plain text이고 태그는 카드 하단에 별도 칩으로만 표시됨 (`src/components/bits/BitCard.tsx`).
  - 본문 파싱하여 `#태그` 토큰만 `<Link>`로 분할 렌더. 하단 태그 칩 유지 여부도 함께 결정.

## 기술 개선 (Gemini 교차리뷰 관찰)

- [ ] 태그 피드 페이지네이션 — `getBitsByTag`에 `take`/`skip` 없음, 대량 데이터 시 전체 로드.
- [ ] 태그 페이지 `generateMetadata` 추가 (SEO·공유 타이틀).
- [ ] 상대 시간 라벨 — 캐싱 도입 시 서버 렌더 시점에 고정되는 문제. 클라이언트 라벨링 검토.
- [ ] `force-dynamic` 캐싱 전략 재검토 (ISR / revalidate).
