# Spec: wiki-links (Obsidian식 링크 · 개념 인라인 링크 · 제목 서식)

## Meta
- **Created**: 2026-11-20 · **Status**: approved (사용자 결정 4건, AskUserQuestion)

## Decisions
- D1 링크 문법: `[[대상]]`, `[[대상|보여줄 글자]]`. 대상 = Thread 제목 또는 발행된 개념의 이름·별칭 (대소문자 무시, 연속 공백은 1칸으로 보고 일치 — 띄어쓰기 자체는 구분). 단독 Bit는 제목이 없어 대상이 아님(Thread로 만들면 링크 가능).
- D2 해석 안 되는 링크는 링크 없이 글자만 보인다(괄호 제거) — 개념이 발행되면 자동으로 링크가 된다.
- D3 에디터: `[[` 입력 시 내 Thread·개념 제목 자동완성. 서식 버튼 B · H1 · H2 · H3.
- D4 백링크: Thread 페이지 하단 "Linked from" — 이 Thread를 [[ ]]로 가리키는 Bit/Thread 목록.
- D5 개념 링크: 뉴스 요약 작성 시 AI가 개념어를 `[[term]]`으로 감싼다. 발행 시 끝에 붙던 "New to this?" Bit와 개념 발행 시 뉴스 Thread에 붙던 백링크 Bit는 더 이상 만들지 않는다(인라인 링크 + Linked from이 대신함). 개념 Thread의 "Related news" Bit는 유지.
- D6 제목 서식: 줄 맨 앞 `# ` `## ` `### `(뒤에 공백) → H1/H2/H3. `#tag`(공백 없이 붙음)와 구분. 의미상 heading(role=heading)이지만 Bit 본문 안이라 span 블록으로 렌더.
- D7 `[[ ]]`, `#` 기호도 500자에 포함.

## Implementation notes (2026-11-20)
- 실측: phpAfterShell 원문으로 CLI 실행 → "a suitable [[gadget chain]] in the app" 인라인 링크 생성
- Gemini diff 리뷰 8건 중 7.5건 반영: 클라이언트로는 페이지가 실제 쓰는 링크만 전달(전체 제목 목록 노출 방지), 프로토타입 키 안전 조회, 첫 줄 빈 줄 H1 버그, 백링크 DB 필터, 정규화 통일, 개념 괄호 보존 범위, CRLF·제목 위 빈 줄, 자동완성 캐시
- 알려진 한계: `**[[링크]]**`처럼 굵게 안의 링크는 굵게가 풀린다 (링크 우선)
