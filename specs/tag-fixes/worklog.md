# Tag fixes — worklog (2026-11-20)

## 요청
- Thread 페이지 태그 목록과 홈 태그 목록이 다르다.
- 태그 없는 글이 있다 — 태그는 중요하다.

## 원인과 수정
- 홈 사이드바는 관리자면 비공개 글 태그까지 세는데, /threads·/threads/[id]는 공개 글만 셌다 → 같은 기준(getTagCloud(owner)).
- 개념 Thread 생성 코드가 태그를 붙이지 않았다 → 뉴스와 같은 규칙의 첫 태그를 첫 Bit 끝에 붙인다(500자 안).

## 데이터 정리 (운영 DB, 같은 날)
- 개념 Thread 5개(deserialization, gadget chain, Golden SAML, screen overlay, use-after-free) 첫 Bit에 #security.
- 직접 쓴 Thread 2개: 제목에만 있던 해시태그를 첫 Bit 끝에 (#system_design, #ai).
- 결과: 홈에 보이는 글 63개 중 태그 없는 글 0개.

## Gemini diff review — 3건 반영
- #1 제목 줄을 100자로 묶어 정의 자리 확보
- #2 개념 태그를 뉴스 요약과 같은 규칙(모델 태그 포함)으로
- #3 빈 값·# 포함 태그 무시
