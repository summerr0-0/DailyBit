# DailyBit Domain Context

## Core Terms

| Term | Description |
|------|-------------|
| Bit | 게시글. DailyBit의 핵심 단위. 500자 이내 |
| BitThread | 이어쓰기 타래. 여러 Bit의 묶음. 첫 글 삭제 시 전체 삭제 |
| Rebit | 리포스트. 원본 Bit를 공유하는 행위 |
| Garden | 잔디밭. GitHub 스타일 1년간 활동 시각화 |
| BitPoint | 활동 점수. 글 1pt, 댓글 0.5pt, Rebit 0.5pt |

## Business Rules

- Bit 내용은 500자 이내 (필수)
- 태그는 최대 10개, 소문자 통일 (#React → #react)
- BitThread 첫 글 삭제 시 전체 타래 삭제
- Garden은 지난 1년간 주별 집계
- 닉네임, 이메일은 전역 unique
