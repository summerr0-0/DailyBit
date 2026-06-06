# /gemini-review

Gemini CLI로 2차 교차검증을 수행한다. Claude가 만든 기획서·코드 diff·테스트를
Gemini가 독립적으로 검토하고, Claude가 양쪽 의견을 종합한다.

검증(authoring)과 리뷰(review)를 다른 모델로 분리해 한쪽 모델의 맹점을 줄이는 것이 목적.

## When

- 기획서(`specs/<feature>/spec.md`) 작성 직후
- 구현 완료 후, PR 생성 직전
- 테스트 작성 후 커버리지 점검이 필요할 때

## How

통로는 `omc ask gemini`다. 결과는 `.omc/artifacts/ask/`에 마크다운으로 저장된다.

### 1. 기획서 검증

```bash
omc ask gemini -p "다음 기획서를 시니어 리뷰어 관점에서 검토하고
누락된 요구사항, 모순, 숨은 리스크를 bullet로 지적해줘. 동의하는 부분은 생략:

$(cat specs/<feature>/spec.md)"
```

### 2. 코드 diff 검증

```bash
omc ask gemini -p "다음 변경을 코드리뷰해줘.
버그, 미처리 엣지케이스, 보안, 불필요한 복잡성 관점에서만 지적:

$(git diff origin/main...HEAD)"
```

### 3. 테스트 커버리지 검증

```bash
omc ask gemini -p "다음 구현과 테스트를 보고
테스트되지 않은 분기·엣지케이스를 지적해줘:

$(git diff origin/main...HEAD -- 'src/**/*.ts' 'src/**/*.tsx')"
```

## Claude의 역할 (종합)

1. 위 명령으로 Gemini 검토를 받는다.
2. Gemini 지적을 항목별로 정리하되, 각 항목에 Claude의 입장을 단다:
   - 동의 → 수정 반영
   - 반론 → 근거와 함께 기각
   - 보류 → 사용자 판단 요청
3. artifact 경로를 사용자에게 알린다.
4. 합의된 수정만 적용한다. Gemini 의견을 무비판 수용하지 않는다.

## Daily Cycle 통합

```
기획서 생성 → /gemini-review(기획) → 구현 → 테스트 통과
   → /gemini-review(diff) → PR 생성
```

## Notes

- `omc ask gemini`는 비대화형(YOLO) 모드로 돈다. 읽기·검토 용도로만 쓰고,
  Gemini가 파일을 직접 수정하게 두지 않는다 (수정은 Claude가 종합 후 수행).
- 3모델(Claude+Codex+Gemini) 합의가 필요하면 OMC `ccg` 스킬을 쓴다.
