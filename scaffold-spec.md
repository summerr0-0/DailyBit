# Scaffold Spec: DailyBit

Created: 2026-06-03
Goal: Next.js 풀스택 기반 세팅 — 클로드가 매일 기능을 추가할 수 있는 DailyBit SNS 개발 환경 구축

## L0: Goal

**Confirmed Goal**: Next.js App Router 풀스택 + Supabase PostgreSQL + Vercel 배포가 연결된 상태에서, 클로드가 설명 없이도 다음 기능을 일관되게 추가할 수 있는 DailyBit SNS 개발 기반 구축

**Non-Goals**:
- SNS 기능 구현 (게시글, 팔로우 등) — 이후 /specify로 매일 진행
- 프로덕션 스케일링, 모니터링
- 디자인 시스템 완성

## L1: Environment

- **Directory**: empty (greenfield confirmed, `.git` initialized)
- **Node**: v22.14.0
- **Package Manager**: pnpm v10.22.0 (available, preferred)
- **Docker**: v27.4.0, compose v2 (available)
- **Git**: v2.50.1, initialized, remote → github.com/summerr0-0/DailyBit
- **Platform**: macOS ARM64 (Apple Silicon)
- **Bun**: not installed

**Auto-resolved from L1**:
- Runtime: Node.js v22 (LTS)
- Package manager: pnpm (installed, will enforce)
- Docker: available → Docker extension 활성화 가능
- Git: remote 연결됨 → Vercel 자동 배포 파이프라인 가능

## L2: Architecture Decisions

### Decisions

| ID | Decision | Rationale | Assumed? |
|----|----------|-----------|----------|
| D1 | Next.js 15 App Router + TypeScript | 풀스택 단일 레포, Vercel 최적화 | No |
| D2 | pnpm | L1 설치 확인, 빠른 설치 속도 | No |
| D3 | Route Handlers + Server Actions | Next.js 네이티브, 별도 API 서버 불필요 | Yes |
| D4 | Tailwind CSS + shadcn/ui | 컴포넌트 빠른 구성, 커스텀 자유도 높음 | Yes |
| D5 | Supabase (PostgreSQL) + Prisma ORM | 무료, 즉시 사용, 타입 안전 마이그레이션 | Yes |
| D6 | NextAuth.js v5 (Auth.js) | DB 어댑터 Supabase 연동 가능 | Yes |
| D7 | Vitest + React Testing Library | Next.js 궁합 최상, 빠른 실행 | Yes |
| D8 | GitHub Actions → Vercel 자동 배포 | git push = preview URL 자동 생성 | Yes |
| D9 | ESLint + Prettier | TypeScript 표준 lint/format | Yes |

### Constraints

- C1: pnpm만 사용, npm/yarn 절대 금지
- C2: App Router 전용 (pages/ 디렉토리 사용 금지)
- C3: Server Component 우선, 필요 시에만 'use client'
- C4: Prisma 스키마가 단일 진실 공급원 (DB 직접 수정 금지)
- C5: .env 파일 직접 수정 금지, .env.example로 관리

### Activated Extensions

- [x] Type Contracts (Prisma 타입 자동 생성)
- [x] Data Layer (Supabase PostgreSQL + Prisma + seed)
- [ ] Docker/Infra (로컬 개발은 Supabase 클라우드 사용)
- [x] Runtime Patterns (Next.js middleware, error boundary)

### Known Gaps

- Supabase 프로젝트 생성 및 환경변수 설정은 사용자가 직접 수행 필요
- Vercel 연동은 git push 후 Vercel 대시보드에서 수동 연결 1회 필요

## L3: Harness Setup

### Domain Context

| 용어 | 설명 |
|------|------|
| Bit | 게시글 (Post). DailyBit의 핵심 단위 |
| BitThread | 이어쓰기 타래. 여러 Bit의 묶음 |
| Rebit | 리포스트. 원본 Bit를 공유하는 행위 |
| Garden | 잔디밭. GitHub 스타일 활동 시각화 |
| BitPoint | 활동 점수. 글 1pt, 댓글 0.5pt, Rebit 0.5pt |

**핵심 비즈니스 규칙**:
- Bit 내용은 500자 이내
- 태그는 최대 10개, 소문자 통일 (#React → #react)
- BitThread 첫 글 삭제 시 전체 타래 삭제
- Garden은 지난 1년간 주별 집계

### Team Conventions

- Commit: Conventional Commits (feat/fix/chore/docs/refactor)
- Branch: GitHub Flow (feature/xxx → main)
- Merge: Squash merge
- PR: 기능 단위, 하루 1-2개

### Rules (from Constraints)

| Constraint | Rule File |
|-----------|-----------|
| C1: pnpm only | `.claude/rules/pnpm-only.md` |
| C2: App Router only | `.claude/rules/app-router-only.md` |
| C3: Server Component 우선 | `.claude/rules/server-component-first.md` |
| C4: Prisma 단일 진실 공급원 | `.claude/rules/prisma-schema-authority.md` |

### Skills

| Skill | Description |
|-------|-------------|
| `/migrate` | Prisma 마이그레이션 실행 + 클라이언트 재생성 |
| `/seed` | 개발용 시드 데이터 생성 |
| `/new-feature` | 오늘의 기능 spec 작성 → 구현 사이클 시작 |

### Hooks

| Hook | Type | Trigger |
|------|------|---------|
| `tsc --noEmit` | PostToolUse | Edit/Write .ts/.tsx |
| `prettier --write` | PostToolUse | Edit/Write .ts/.tsx/.css |
| Block .env* edit | PreToolUse | Edit/Write .env* |
| Block lock file edit | PreToolUse | Edit/Write pnpm-lock.yaml |

## L4: Plan

### Requirements

| ID | Requirement | Source | Conditional? |
|----|------------|--------|-------------|
| R1 | Code Structure: Next.js 15 App Router + 수직 슬라이스 예시 (Bit CRUD) | L2 | No |
| R2 | Test Infrastructure: Vitest + RTL 설정 + 예시 테스트 | L2 | No |
| R3 | Guard Rails: CLAUDE.md + ESLint + Prettier + CI + .env.example | L2 | No |
| R4 | Type Contracts: Prisma 스키마 → 타입 자동 생성 | L2 | Yes (activated) |
| R5 | Data Layer: Supabase 연결 + Prisma 마이그레이션 + seed | L2 | Yes (activated) |
| R8 | Project Rules: .claude/rules/ 파일 | L3 | Yes (approved) |
| R9 | Domain Skills: /migrate, /seed, /new-feature | L3 | Yes (approved) |
| R10 | Project Hooks: tsc + prettier + .env 보호 | L3 | Yes (approved) |

### Task DAG

| ID | Task | Fulfills | Depends On |
|----|------|----------|------------|
| T1 | Next.js 15 프로젝트 초기화 (pnpm, TS, Tailwind, shadcn) | R1 | - |
| T2 | Guard Rails (CLAUDE.md, ESLint, Prettier, .env.example, CI) | R3, R8 | T1 |
| T4 | Test Infrastructure (Vitest, RTL, path aliases) | R2 | T1 |
| T6 | Data Layer (Prisma 설정, User+Bit 스키마, seed 스크립트) | R4, R5 | T1 |
| T3 | 수직 슬라이스 예시: Bit 목록 조회 (route → service → prisma → UI → test) | R1 | T2, T4, T6 |
| T_SKILL | 프로젝트 스킬 생성 (/migrate, /seed, /new-feature) | R9 | T3 |
| T_HOOK | .claude/settings.json 훅 설정 | R10 | T1 |
| TF | 검증 (build, lint, typecheck, test 전부 통과 확인) | - | all |

### Quality Criteria

- **클로드 확장성**: T3 수직 슬라이스가 다음 기능의 레퍼런스
- **테스트 가능성**: T4 인프라 + T3 예시 테스트
- **드리프트 저항**: CLAUDE.md + rules + lint + CI (T2)
- **타입 안전**: Prisma 스키마 → 전 레이어 타입 자동 흐름 (T6)
- **세션 연속성**: CLAUDE.md에 도메인/팀/스킬/훅 전부 기록
- **작업 자동화**: /migrate, /seed, /new-feature (T_SKILL)



