# Mermaid diagrams — worklog (2026-11-20)

## 요청
Bit 본문에 Mermaid 도표를 그릴 수 있게. (뉴스 크롤러 구조를 도표로 소개하려는 목적)

## 결정
- 문법: 마크다운 코드 블록 ```mermaid … ```. 다른 언어의 ``` 블록은 고정폭 코드 블록으로 표시.
- 블록 안은 #태그·[[링크]]·굵게/취소선으로 해석하지 않는다 (Mermaid의 `A[[x]]`, `fill:#f9f`와 충돌 방지). 태그 추출·백링크도 블록을 제외.
- 렌더: 클라이언트 컴포넌트가 mermaid를 도표가 있을 때만 동적 import. securityLevel "strict" (DOMPurify 정화, 클릭 핸들러 차단), 문법 오류면 원문 + 안내 문구.
- 에디터: "◇ Diagram" 버튼이 도표 틀을 넣고 첫 줄을 선택. 툴바는 좁은 화면에서 줄바꿈.
- 500자 제한은 그대로 (간단한 흐름도는 300자 안팎).
- 로컬 `next build`는 이 환경에서 Google Fonts를 못 받아 실패(기존 문제, 무관) → Vercel 미리보기 빌드와 CI e2e로 확인.

## Gemini diff review (gemini-diff-review.md) — 전부 반영
- #1 suppressErrorRendering: true — 깨진 도표가 body에 오류 SVG를 남기지 않게. e2e로 확인.
- #2 코드 블록 파서를 줄 단위로 — 닫히지 않은 블록이 뒤 글을 삼키지 않게, 빈 블록 허용. 테스트 추가.
- #3 mermaid 로드 실패 시 캐시 해제 후 재시도.
- #4 MermaidDiagram 성공/실패 분기 단위 테스트, 여러 블록·빈 블록·미종결 테스트.
