# News tag allowlist — worklog (2026-11-20)

## 요청
"하드웨어나 PHP breach 같은 건 내 분야가 아니니 그냥 보안 태그만. 태그가 너무 지저분해진다."

## 결정
- 뉴스 태그는 허용 목록(`NEWS_TAGS`, src/lib/news-sources.ts) 안에서만: ai, llm, security, java, spring, kotlin, react, nextjs, nodejs, javascript, typescript, database, aws, cloud, devops, kubernetes, backend, frontend.
- 대표 태그가 항상 첫 번째: 소스 `tag`(개발 블로그 spring·java·react·nextjs·nodejs) 또는 category(ai·security).
- 모델 태그는 별칭으로 바꾼 뒤(openai→ai, gpt→llm, vulnerability/zeroday/malware/breach→security 등) 목록 안의 것만 남긴다. 최대 3개.
- 프롬프트도 목록에서만 고르게(0~2개, 회사·제품명 금지).
- 목록에 태그를 더하려면 `NEWS_TAGS`에 한 줄 추가.

## 기존 공개 뉴스 재태깅 (retag-2026-11-20.json에 이전 값)
보안 뉴스 8개 → #security, OpenAI 1개 → #ai #llm.
