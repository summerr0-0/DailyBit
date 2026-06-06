# DailyBit

트위터형 SNS. Next.js 16 App Router + Supabase PostgreSQL + Vercel.

## Stack

TypeScript | Next.js 16 App Router | Tailwind + shadcn/ui | Prisma + Supabase | Vitest

## Directory Map

```
src/app/          pages, layouts, API route handlers
src/components/   React components (ui/ = shadcn, do not edit)
src/lib/          shared utils (prisma.ts = DB singleton)
src/generated/    Prisma types (auto-generated, do not edit)
prisma/           schema.prisma (single source of truth)
.claude/rules/    enforced constraints
docs/             architecture & domain details
```

## Active Rules

- pnpm only (never npm/yarn) → `.claude/rules/pnpm-only.md`
- App Router only (no pages/) → `.claude/rules/app-router-only.md`
- Server Component default → `.claude/rules/server-component-first.md`
- Prisma schema owns DB → `.claude/rules/prisma-schema-authority.md`
- Docs stay in-repo, not Obsidian → `.claude/rules/in-repo-docs.md`

## Project Skills

| Command | What it does |
|---------|-------------|
| `/migrate` | Prisma migration + client regenerate |
| `/seed` | Load dev seed data |
| `/new-feature` | Start today's feature build cycle |

## Active Hooks

- `tsc --noEmit` on .ts/.tsx edit (type check)
- `prettier --write` on .ts/.tsx/.css edit (format)
- .env* edit blocked (protect secrets)

## Context (load on demand)

@docs/domain.md
@docs/architecture.md
@docs/policies.md
