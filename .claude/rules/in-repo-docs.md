# Rule: Documentation stays in-repo

이 프로젝트의 모든 문서화와 작업 기록은 저장소 안에서 관리한다.
사용자 전역 규칙이 지정하는 Obsidian 경로(`/Users/jeong-ilin/Obsidian/document/`)는
**이 프로젝트에 적용하지 않는다.** (프로젝트 규칙이 전역 규칙을 오버라이드)

- 세션 요약·메모·작업 기록을 Obsidian에 쓰지 않는다.
- 맥락은 저장소 내부에 둔다:
  - 아키텍처 / 도메인 / 팀 정책 → `docs/`
  - 기능 기획서 → `specs/`
  - 강제 제약 → `.claude/rules/`
  - 작업 이력 → git 커밋 + PR 본문
- 별도 작업 노트가 필요하면 `docs/` 하위에 둔다. Obsidian은 사용하지 않는다.
