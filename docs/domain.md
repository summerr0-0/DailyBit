# DailyBit Domain Context

## Core Terms

| Term | Description |
|------|-------------|
| Bit | 핵심 단위. 500자 이내 짧은 학습 기록 |
| Thread | 탐구 타래. 하나의 주제를 단계별로 이어 쓴 Bit 묶음 |
| Garden | 1년간 활동을 잔디밭으로 시각화. Thread Bit 2pt, 독립 메모 1pt |
| Tag | #태그로 스킬 영역 분류 (#nextjs, #prisma 등) |
| Pin | 중요한 Bit를 피드 상단에 고정 |

## Business Rules

- Bit 내용은 500자 이내 (필수)
- #태그는 소문자 통일 (#React → #react)
- Thread 첫 Bit 삭제 시 전체 Thread 삭제
- Garden은 지난 1년간 주별 집계. Thread Bit 2pt, 독립 메모 1pt
- 팔로우 없음
- Irin(오너 로그인)만 Bit 작성·삭제·Thread 생성·Rebit 가능
- 방문자(로그인 불필요): 읽기·좋아요·댓글 가능 — 계정 없이 익명 인터랙션
- 좋아요: 익명 단순 카운터 (쿠키 기반 중복 방지)
- 댓글: 익명(이름 선택 입력), 300자 이내, 대댓글 없음, 삭제는 Irin만
