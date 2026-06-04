# Rule: Prisma schema is the single source of truth

- All data model changes go through `prisma/schema.prisma`
- Never modify DB directly (no raw SQL DDL outside migrations)
- After schema change: run `pnpm db:migrate` to create migration
- After migration: run `pnpm db:generate` to regenerate client types
- Import Prisma client only from `@/lib/prisma`
