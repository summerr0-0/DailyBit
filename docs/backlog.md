# Backlog

착수 시 `/new-feature`로 스펙을 작성한다.

## 기능 (스펙 작성 완료, 승인 대기)

- [ ] **인증 가드** — passphrase 쿠키 기반. 로그인 시 쓰기 가능, 비로그인은 읽기만. `specs/auth-guard`
- [ ] **Rebit** — 로그인 후 Bit 리비트, 피드에 "Irin이 Rebit함" 표시. `specs/rebit-v2`
- [ ] **좋아요** — 하트 토글, 카운트 표시. 비로그인은 카운트만. `specs/like`
- [ ] **댓글** — 로그인 시 작성, 비로그인 시 읽기만. 300자 이내. `specs/comments`

## 기능 (백로그)

- [ ] **프로필 페이지** — 사진, 자기소개, LinkedIn, GitHub, 이력서 링크. ProfileCard 완성.
- [ ] **Markdown 렌더** — 코드 블록, 볼드, 링크 등 기본 마크다운 지원. 개발 블로그 필수.
- [ ] **검색** — 본문·태그 통합 검색.
- [ ] **Thread 완료 마킹** — Thread에 "완결" 상태 추가. 완결된 타래는 배지 표시.
- [ ] **GitHub 로그인** — NextAuth로 교체. specs/auth-github 참고.
- [ ] **OG 메타태그** — Thread/Bit 페이지에 Open Graph 태그. 링크 공유 시 미리보기.

## 기술 부채

- [ ] Thread 페이지 `generateMetadata` — Thread 제목을 `<title>`로.
- [ ] 태그 피드 페이지네이션 — 대량 데이터 시 전체 로드 문제.
- [ ] `force-dynamic` 캐싱 전략 재검토 (ISR / revalidate).
