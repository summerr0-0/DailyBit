# 1b — worklog (2026-11-24)

- 사용자: Reddit API는 승인제(2025-11 Responsible Builder Policy)라 미루고 1b 먼저.
- 기존 `parseFeed`·`normalizeUrl` 재사용. IRCC Atom은 `published`가 없어 날짜 없이 "최신 3개" 규칙으로 첫 실행 처리.
- 2a의 `immigration-weekly` 스크립트·워크플로를 `immigration-news`로 합침(매일 실행, 월요일에 CN드림 추가) — 2a가 아직 머지 전이라 같은 PR 줄기에서 정리.
- 정규화 URL(www 제거)은 비교에만, 알림에는 원래 링크 — 테스트에서 발견.
- 실제 dry-run(로컬 Claude CLI): IRCC 3 + CIC 3 → 관련 3건(이민 수준 계획, EE 재편, CRS 500+ 후보 2배), NL·PEI 선발 기사 2건은 걸러짐.
- tsc, eslint, vitest 356 통과.

## Gemini 리뷰 반영 (gemini-review.md)
- #1 AI가 빠뜨린 글이 본 것으로 저장됨 → 다음 실행에서 다시 본다.
- #2 첫 실행에 빈 피드면 []가 저장돼 다음에 옛 글 15건이 쏟아짐 → 빈 피드는 저장 안 함.
- #3 피드 안 중복 URL → 하나만.
- #4 긴 링크면 500자 초과 가능 → `newsNote`가 링크·태그 먼저, 제목도 남는 자리에 맞춰 자르고 최종 500자 보장.
- #5 월요일 CN드림 실패가 exit 0 → 실패로.
- #6 응답 크기 확인 전 버퍼링 — 1단계와 같은 방식이라 그대로.
- #7 관계없는 로컬 파일(`scripts/.obsidian-import.ts`)이 스테이징됨 → 커밋에서 뺌(내 실수, `git add scripts` 때문).
- 회귀 테스트 4개 추가. vitest 360 통과.
