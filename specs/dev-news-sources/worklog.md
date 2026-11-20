# Dev news sources — worklog (2026-11-20)

## 요청
- Java·Spring·React·Next.js·Node.js 관련 뉴스도 수집. 공식 블로그만.
- 개발 뉴스는 AI·보안과 따로, 하루 최대 5개 (사용자 선택: "개발 뉴스 따로 5개").

## 결정
- 소스 5개 (category `dev`): Spring Blog, Inside Java, React Blog, Next.js Blog, Node.js Blog. 5개 모두 현재 파서로 정상 파싱 확인.
- 상한: AI·보안 = 실행당 3 (기존 그대로). 개발 = 최근 24시간 5 (`MAX_DEV_EVENTS_PER_DAY`), 저장소에서 지난 실행분 집계.
- 개발 사건 판정: 초안에 실제로 들어간 출처(본문 확보·출처 3개 상한 후) 중 개발 출처가 하나라도 있으면 개발.
- 상한에 밀린 사건은 CANDIDATE로 남아 다음 실행에서 다시 경쟁, 48시간 지나면 stale.
- 채점 프롬프트: 정식 major/minor·보안 릴리스·릴리스 대상 JEP = High, 버그 수정 패치 = 4-5(컷 아래), alpha/beta/RC/주간 모음 = Low.
- DB 스키마 변경 없음.

## 실측 채점 (Haiku, 2026-11-20 공식 블로그 최근 7일)
Spring AI 2.1 GA 8 · Spring Boot 4.2.0 8 · JEP 547 7 · Boot 패치 5 · Inside Java Newscast 5 · Next.js 보안 글 5 · Node.js alpha 1

## Gemini diff review (gemini-diff-review.md)
- #1 반영: 판정을 withContent 기준으로 (저장소 집계와 일치). 테스트 추가.
- #2 미반영(기록): AI·보안 사건에 개발 출처가 늦게 붙으면 그 사건이 개발 상한에도 잡힌다 — 상한을 더 보수적으로만 만든다.
- #3 미반영(기록): 실행 안 개발 상한은 시도 수 기준(모델 호출 비용 가드). 실패분은 FAILED로 다음 실행 재시도.
- #4 반영: 패치 릴리스 4-5 명시.
- #5 반영: 24시간 사건 먼저 조회 후 개발 출처 확인.
- #6 반영: 인박스 문구에 Next.js.
