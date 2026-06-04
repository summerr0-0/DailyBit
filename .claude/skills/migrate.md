# /migrate

Prisma 마이그레이션 실행 및 클라이언트 재생성.

## Steps

1. `pnpm db:migrate` — 마이그레이션 파일 생성 + DB 적용
2. `pnpm db:generate` — Prisma 클라이언트 타입 재생성
3. 생성된 마이그레이션 파일 확인 후 커밋

## Usage

스키마(`prisma/schema.prisma`) 변경 후 항상 실행.

```bash
pnpm db:migrate
# prompt: migration name (e.g., "add-rebit-model")
pnpm db:generate
```
