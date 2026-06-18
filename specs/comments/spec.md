# Spec: comments

## Meta
- **Created**: 2026-06-17
- **Type**: dev
- **Status**: implemented

## Goal
방문자(로그인 불필요)가 Bit에 익명 댓글을 달 수 있다.
Irin(로그인)은 모든 댓글을 삭제할 수 있다.

## Non-goals
- 로그인/계정 연동
- 댓글 좋아요
- 대댓글
- 댓글 수정

## Requirements

### R1: 댓글 작성 (로그인 불필요)
- 이름(선택, 빈칸 시 "익명") + 내용(필수, 300자 이내)
- `POST /api/bits/:id/comments` → 201
- 스팸 방지: 내용 빈칸 차단, 300자 초과 차단 (서버 검증)

### R2: 댓글 목록 (공개)
- BitCard 하단 댓글 카운트 표시
- 카운트 클릭 → 댓글 섹션 인라인 펼치기
- `GET /api/bits/:id/comments` → 목록 (최신순)

### R3: 댓글 삭제 (Irin만 — 쿠키 `db_auth=1`)
- 댓글 옆 삭제 버튼: 로그인 상태에서만 표시
- `DELETE /api/comments/:id` → 204 (쿠키 없으면 401)

### R4: DB
```
Comment {
  id        String   @id @default(cuid())
  content   String   @db.VarChar(300)
  author    String   @default("익명")  // 방문자 입력 이름
  bitId     String
  bit       Bit      @relation(fields: [bitId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
}
```

## Tasks

### T1: DB 스키마 + API [backend]
- `prisma/schema.prisma` — `Comment` 모델 추가
- `pnpm db:migrate`
- `src/lib/comments.ts` — `getComments(bitId)`, `createComment(bitId, content, author)`, `deleteComment(id)`
- `src/app/api/bits/[id]/comments/route.ts` — GET (공개), POST (공개)
- `src/app/api/comments/[id]/route.ts` — DELETE (`requireAuth`)

### T2: UI [frontend]
- `src/components/bits/CommentSection.tsx` — `"use client"`, 댓글 목록 + 입력폼
- `BitCard` — 댓글 카운트 배지 + CommentSection 토글

### T3: 테스트
- 댓글 작성 API 검증 (인증 불필요)
- 댓글 삭제 API 검증 (쿠키 없으면 401)
