# Deep Interview Insights: 테크 글 스크랩·정리 기능 (Feature #1)
> Date: 2026-07-13
> Rounds: 7
> Final Ambiguity Score: 0.22 (Forming, Solid 직전)

## Core Problem
읽은 좋은 개발 글을 소화·기록하지 못하고 흘려보내는 문제 — AI가 초안을 대신 만들어 "기록으로 남기는 마찰"을 없애준다.

## Scope Decision
- 사용자가 제안한 두 기능 중 **#1(내가 준 링크/영상/글 정리)을 먼저** 빌드.
- #2(트위터/링크드인 화제 글 자동 수집)는 이후로 미룸 — 단, 정리할 아티클의 출처가 곧 트위터/링크드인이라 두 기능은 연결돼 있음.

## Key Insights & Decisions
- 출력은 완성 Bit가 아니라 **비공개 draft**. Irin 컨펌 시에만 발행.
- AI의 "단 하나의 산출물" = **충실한 요약 + 쉬운 보충 설명**. AI 특유의 과장된 비유는 금지.
- **500자 강박 해소:** 길면 하나의 Bit로 욱여넣지 않고 주제가 관통하는 **Thread(타래)로 분할**. (이번 인터뷰 최대 수확)
- **결과물 언어 = 영어.** 포트폴리오 English 전환과 일관. ("번역"의 정체는 한국어화가 아니라 영문 산출물)

## Defined Requirements
- 입력 파이프라인: **기본 URL** → fetch 실패 시 시스템이 알림 → **Irin이 복붙 텍스트 or 캡처로 fallback**
- 유튜브는 **자막(transcript) 기반** 요약
- AI 출력: 충실한 요약 + 쉽고 간결한 보충 설명, 절제된 톤(과장 비유 금지), **영문**
- 산출물 형태: 단일 Bit 또는 주제 일관 Thread (추가 설명은 타래 내 다음 Bit로)
- 저장 상태: **비공개 draft → Irin 컨펌 → 발행**

## Identified Risks & Failure Modes
- 트위터/링크드인 서버사이드 fetch 불가(로그인 벽·JS 렌더링) → 자동 스크랩을 v1 필수 요건에서 제외.
- 티저 vs 실제 아티클 혼동 — 짧은 포스트가 외부 글로 링크아웃해 무엇을 요약할지 모호.
- 충실한 장문 요약 ↔ 간결한 Bit의 긴장 → Thread 분할로 완화하되 "언제 1 Bit / 언제 Thread"의 판단 기준 미정.
- 성공이 정량화되지 않아 좋은/나쁜 드래프트를 사후 구분할 지표 없음.

## Open Questions & Unknowns
- 성공 기준의 정량화: "안 그랬으면 기록 안 했을 것"을 어떻게 관측? (주당 발행 Bit 수 / 컨펌까지 손질 시간 등)
- Thread 분할 판단 규칙: 몇 자/몇 포인트 넘으면 타래로? 자동 제안 vs 수동 결정?
- 스크린샷/OCR(v2): 캡처 fallback을 v1에 넣을지 v2로 미룰지 미확정.
- 한국어 소스 처리: 영문 출력 원칙이면 한국어 글을 영어로 옮기는 것도 포함되는지.

## Clarity Assessment
Ambiguity Score: 0.22
- Goal Clarity: 0.82 (40%)
- Constraint Clarity: 0.75 (30%)
- Success Criteria: 0.68 (30%)

Maturity: Forming (Solid 직전) — 파이프라인·입력·출력·톤·언어는 확정. 남은 물렁한 지점은 성공 기준이 행동 신호("안 그랬으면 기록 안 했을 것")라 아직 정량적이지 않다는 것.
