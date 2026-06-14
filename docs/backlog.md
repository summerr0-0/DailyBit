# Backlog

DailyBit 개선 아이디어 모음. 우선순위·범위는 미정이며, 착수 시 `/specify`로 스펙을 작성한다.
개인 포트폴리오 블로그 방향으로 전환됨. 소셜 기능(Follow, Like, 알림, Rebit, 멘션)은 제외.

## 기능

- [ ] **검색** — 본문·태그 통합 검색. 결과 페이지 + 상단 검색창.
- [ ] **Thread 완료 마킹** — Thread에 "완결" 상태 추가. 완결된 탐구 줄기는 배지 표시.
- [ ] **본문 Markdown 렌더** — 코드 블록, 볼드, 링크 등 마크다운 기본 요소 지원. 개발자 블로그 필수.
- [ ] **OG 메타태그** — 각 Thread/Bit 페이지에 Open Graph 메타태그. 링크 공유 시 미리보기.
- [ ] **Rebit 코드 정리** — UI에서 이미 제거됨. Rebit 모델·API·lib 파일 삭제.

## 기술 개선

- [ ] 태그 피드 페이지네이션 — `getBitsByTag`에 `take`/`skip` 없음, 대량 데이터 시 전체 로드.
- [ ] 태그 페이지 `generateMetadata` 추가 (SEO·공유 타이틀).
- [ ] `force-dynamic` 캐싱 전략 재검토 (ISR / revalidate).
- [ ] Thread 페이지 `generateMetadata` — Thread 제목을 `<title>`로.
