# Architecture

## Stack

- Framework: Next.js 16 App Router
- Language: TypeScript (strict)
- Styling: Tailwind CSS + shadcn/ui
- Database: Supabase PostgreSQL + Prisma ORM
- Auth: 미구현 (DEV_USER 고정값으로 개발 중)
- Testing: Vitest + React Testing Library
- Deploy: Vercel (git push → auto preview)

## Directory Map

```
src/
  app/           # Next.js App Router (pages, layouts, route handlers)
    api/         # Route Handlers (REST endpoints)
  components/
    bits/        # Bit 관련 컴포넌트
    garden/      # Garden 관련 컴포넌트
    layout/      # SiteShell, SiteNav (전체 레이아웃)
    profile/     # 프로필 카드
    ui/          # shadcn/ui primitives (generated, do not edit)
  lib/           # 공유 유틸리티
    prisma.ts    # Prisma client singleton
    bits.ts      # Bit CRUD
    threads.ts   # Thread CRUD
    garden.ts    # Garden 집계
    tags.ts      # 태그 파싱
  generated/     # Prisma generated types (do not edit)
prisma/
  schema.prisma  # Single source of truth for data model
docs/            # Architecture & domain context
specs/           # Feature specs & worklogs
```

## Key Decisions

- D1: No separate API server. Next.js Route Handlers handle all API calls.
- D2: Server Components are default. `use client` is opt-in.
- D3: Prisma schema owns the DB schema. Never modify DB directly.
- D4: pnpm is the only allowed package manager.
- D5: Auth 없음 — DEV_USER(email: dev@dailybit.dev)로 고정. 나중에 NextAuth 추가 예정.

## Data Flow

```
Client → Server Component (fetch) → prisma → Supabase
Client → Route Handler (POST/PUT/DELETE) → prisma → Supabase
```

## Layout Structure

```
SiteShell
  ├── Left sidebar (md+)  — SiteNav (DailyBit 로고, Home, Garden 링크)
  ├── Center feed         — 각 페이지 콘텐츠
  └── Right panel (lg+)   — ProfileCard + GardenMini (홈 페이지만)
```
