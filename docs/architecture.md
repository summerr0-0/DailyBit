# Architecture

## Stack

- Framework: Next.js 16 App Router
- Language: TypeScript (strict)
- Styling: Tailwind CSS + shadcn/ui
- Database: Supabase PostgreSQL + Prisma ORM
- Auth: NextAuth.js v5
- Testing: Vitest + React Testing Library
- Deploy: Vercel (git push → auto preview)

## Directory Map

```
src/
  app/           # Next.js App Router (pages, layouts, route handlers)
    api/         # Route Handlers (REST endpoints)
  components/    # React components
    ui/          # shadcn/ui primitives (generated, do not edit manually)
  lib/           # Shared utilities
    prisma.ts    # Prisma client singleton
  generated/     # Prisma generated types (do not edit)
  test/          # Test setup
prisma/
  schema.prisma  # Single source of truth for data model
  seed.ts        # Development seed data
docs/            # Architecture & domain context
.claude/
  rules/         # Enforced coding constraints
  skills/        # Project-specific task recipes
```

## Key Decisions

- D1: No separate API server. Next.js Route Handlers handle all API calls.
- D2: Server Components are default. 'use client' is opt-in.
- D3: Prisma schema owns the DB schema. Never modify DB directly.
- D4: pnpm is the only allowed package manager.

## Data Flow

```
Client → Server Component (fetch) → prisma → Supabase
Client → Route Handler (POST/PUT/DELETE) → prisma → Supabase
```
