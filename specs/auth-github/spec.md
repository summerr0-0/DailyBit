# Spec: auth-github

## Meta
- **Created**: 2026-06-08
- **Type**: dev
- **Status**: approved
- **Approved by**: user
- **Approved at**: 2026-06-08

## Goal
NextAuth.js v5 GitHub OAuth 로그인/로그아웃 — 세션 기반 인증, 기존 dev user 패턴 대체

## Non-goals
- 다른 OAuth 공급자 (Google 등)
- 이메일/비밀번호 인증
- 권한 레벨(role) 시스템

## Tasks

### T1: 패키지 설치 + NextAuth 기본 설정 + Prisma migration [infra]
- **Fulfills**: R1, R2.5
- **Depends on**: (none)
- `pnpm add next-auth@5`
- `prisma/schema.prisma`: `nickname String? @unique` 변경
- `src/auth.ts`: NextAuth 설정 파일 생성 (GitHub provider 등록, 빈 callbacks)
- `src/app/api/auth/[...nextauth]/route.ts`: NextAuth 핸들러 연결
- `.env.example` 업데이트: `GITHUB_ID`, `GITHUB_SECRET` 항목 추가
- `pnpm db:migrate` 실행

### T2: GitHub OAuth 콜백 구현 — User upsert + JWT/session 설정 [vertical]
- **Fulfills**: R0, R2.1, R2.2, R2.3, R2.4
- **Depends on**: T1
- `src/auth.ts` callbacks 구현: `signIn`(User upsert by email, private email fallback), `jwt`(token.userId, token.hasNickname), `session`(session.user.id, session.user.hasNickname)
- `src/types/next-auth.d.ts`: session/jwt 타입 확장
- 검증: `/api/auth/signin` 접근 시 GitHub OAuth 화면 열림

### T3: 헤더 로그인/로그아웃 UI [vertical]
- **Fulfills**: R5, R6.1, R6.2
- **Depends on**: T2
- `src/components/layout/HeaderAuthButton.tsx` 신규 (server component: `auth()` 호출 → 로그인/로그아웃 버튼)
- `src/app/layout.tsx` 또는 `src/app/page.tsx`: HeaderAuthButton 삽입
- 로그아웃 버튼: `signOut()` 호출 후 `/` 리다이렉트

### T4: Onboarding 페이지 + nickname 저장 API + middleware [vertical]
- **Fulfills**: R3
- **Depends on**: T2
- `src/app/api/users/me/route.ts`: `PATCH` handler — nickname 저장, 중복 시 409
- `src/app/onboarding/page.tsx`: nickname 입력 폼, submit → PATCH → `update()` → `/` 이동
- `middleware.ts`: `session.user.hasNickname === false` → `/onboarding` 강제 리다이렉트

### T5: write API 보호 — getAuthUser() + 4개 라우트 교체 [vertical]
- **Fulfills**: R4
- **Depends on**: T2
- `src/lib/auth-helpers.ts`: `getAuthUser()` 신규 — `auth()` → userId 반환, 미인증 시 throw 401
- `src/lib/bits.ts`: `createBit()`의 `ensureDevUser()` → `getAuthUser()` 교체
- `src/lib/rebits.ts`: `addRebit()`, `removeRebit()`의 `ensureDevUser()` → `getAuthUser()` 교체
- `src/app/api/bits/[id]/route.ts` DELETE: 소유권 체크 추가 (`bit.authorId !== user.id` → 403)

### T6: BitComposer 미인증 → 로그인 유도 [vertical]
- **Fulfills**: R6.3
- **Depends on**: T2
- `src/components/bits/BitComposer.tsx`: 세션 없을 때 폼 제출 시 `signIn("github")` 리다이렉트

## External Dependencies

### Pre-work
- GitHub OAuth App 생성 (https://github.com/settings/applications/new)
  - Homepage URL: `http://localhost:3000`
  - Callback URL: `http://localhost:3000/api/auth/callback/github`
  - 발급된 Client ID → `GITHUB_ID`, Client Secret → `GITHUB_SECRET` 환경변수 설정
- `AUTH_SECRET` 생성: `npx auth secret` 또는 `openssl rand -base64 32` → `.env` 설정

### Post-work
- Vercel 배포 시 `GITHUB_ID`, `GITHUB_SECRET`, `AUTH_SECRET`, `NEXTAUTH_URL` 환경변수 설정 필요

## Requirements

### R0: GitHub OAuth 인증 시스템 — 전체 플로우 동작

#### R0.1: 로그인한 유저는 세션을 통해 인증된 상태로 앱을 사용한다
- **Given**: 유저가 GitHub OAuth로 로그인 완료 상태
- **When**: 페이지를 열거나 API를 호출할 때
- **Then**: `session.user.id`가 존재하고, Bit 작성 등 인증 필요 기능을 사용할 수 있다

---

### R1: Prisma 스키마 — nickname nullable 변경 (D10)

#### R1.1: nickname 컬럼이 null을 허용한다
- **Given**: `prisma/schema.prisma`의 User 모델
- **When**: `pnpm db:migrate` 실행
- **Then**: `nickname String? @unique`로 변경되고 DB에 migration이 적용된다

---

### R2: NextAuth.js v5 설정 및 GitHub OAuth 연결 (D5, D6, D11)

#### R2.1: GitHub OAuth signIn 시 User가 DB에 upsert된다
- **Given**: 유저가 GitHub 계정으로 로그인 시도, `GITHUB_ID`/`GITHUB_SECRET`/`AUTH_SECRET` 환경변수 설정됨
- **When**: NextAuth signIn 콜백 실행
- **Then**: `prisma.user.upsert({ where: { email }, create: { email, nickname: null } })`로 User 생성 또는 조회됨

#### R2.2: JWT에 userId와 hasNickname이 포함된다
- **Given**: signIn 콜백에서 User upsert 완료
- **When**: NextAuth jwt 콜백 실행
- **Then**: `token.userId = user.id`, `token.hasNickname = user.nickname !== null` 설정됨

#### R2.3: session 객체에 user.id와 user.hasNickname이 노출된다
- **Given**: JWT에 userId, hasNickname 포함
- **When**: NextAuth session 콜백 실행
- **Then**: `session.user.id`, `session.user.hasNickname` 사용 가능

#### R2.4: GitHub private email 계정도 로그인 가능하다
- **Given**: GitHub 계정의 email이 비공개(private) 설정
- **When**: GitHub OAuth signIn
- **Then**: `{githubId}+{login}@users.noreply.github.com` 이메일로 User upsert 진행

#### R2.5: `/api/auth/[...nextauth]` 라우트가 존재한다
- **Given**: `src/app/api/auth/[...nextauth]/route.ts` 파일
- **When**: GET/POST `/api/auth/*` 요청
- **Then**: NextAuth v5 핸들러가 응답한다

---

### R3: 첫 로그인 Onboarding — nickname 설정 (D1, D8)

#### R3.1: nickname 없는 로그인 유저는 /onboarding으로 리다이렉트된다
- **Given**: 로그인 세션 있고 `session.user.hasNickname === false`
- **When**: `/onboarding` 외 페이지 접근 (middleware)
- **Then**: `/onboarding`으로 리다이렉트됨

#### R3.2: /onboarding 페이지에서 nickname을 입력하고 저장할 수 있다
- **Given**: 유저가 `/onboarding` 페이지에 있고 nickname이 없는 상태
- **When**: nickname 입력 후 폼 제출
- **Then**: `PATCH /api/users/me` API로 nickname 저장 요청 전송

#### R3.3: nickname 저장 API가 중복을 거부한다
- **Given**: 이미 `alice`라는 nickname이 DB에 존재
- **When**: `PATCH /api/users/me { nickname: "alice" }` 요청
- **Then**: `409 Conflict` 반환

#### R3.4: nickname 저장 성공 후 JWT가 갱신되어 hasNickname이 true가 된다
- **Given**: `PATCH /api/users/me` 성공 (200 반환)
- **When**: 클라이언트에서 NextAuth `update()` 호출
- **Then**: JWT의 `hasNickname`이 `true`로 갱신되고 middleware가 /onboarding 리다이렉트를 중단한다

#### R3.5: nickname 저장 성공 후 홈으로 이동한다
- **Given**: onboarding 완료, JWT 갱신됨
- **When**: `update()` 완료
- **Then**: `/`로 라우팅됨

---

### R4: write API 보호 — 인증 강제 및 소유권 체크 (D2, D3, D7)

#### R4.1: 미인증 Bit 작성 요청이 거부된다
- **Given**: 로그인 세션 없는 상태
- **When**: `POST /api/bits` 요청
- **Then**: `401 Unauthorized` 반환

#### R4.2: 미인증 Bit 삭제 요청이 거부된다
- **Given**: 로그인 세션 없는 상태
- **When**: `DELETE /api/bits/[id]` 요청
- **Then**: `401 Unauthorized` 반환

#### R4.3: 타인의 Bit 삭제가 거부된다
- **Given**: 로그인한 유저 A, Bit의 작성자가 유저 B
- **When**: 유저 A가 `DELETE /api/bits/[id]` 요청
- **Then**: `403 Forbidden` 반환

#### R4.4: 미인증 Rebit 요청이 거부된다
- **Given**: 로그인 세션 없는 상태
- **When**: `POST /api/rebits` 또는 `DELETE /api/rebits` 요청
- **Then**: `401 Unauthorized` 반환

---

### R5: 로그아웃 (confirmed goal)

#### R5.1: 로그아웃 시 세션이 종료된다
- **Given**: 로그인 상태의 유저
- **When**: 로그아웃 버튼 클릭 → NextAuth `signOut()` 호출
- **Then**: 세션 쿠키가 삭제되고 홈(/)으로 리다이렉트됨

---

### R6: UI — 로그인/로그아웃 버튼 (D2, D3)

#### R6.1: 비로그인 유저에게 로그인 버튼이 표시된다
- **Given**: 로그인 세션 없는 상태
- **When**: 홈 페이지(/) 또는 헤더를 볼 때
- **Then**: "GitHub로 로그인" 버튼이 표시됨

#### R6.2: 로그인 유저에게 로그아웃 버튼과 닉네임이 표시된다
- **Given**: 로그인 세션 있는 상태
- **When**: 홈 페이지(/) 또는 헤더를 볼 때
- **Then**: 닉네임과 로그아웃 버튼이 표시됨

#### R6.3: 미로그인 유저가 BitComposer를 통해 로그인 페이지로 유도된다
- **Given**: 로그인 세션 없는 상태
- **When**: Bit 작성 시도 (BitComposer 클릭 또는 폼 제출)
- **Then**: GitHub 로그인 페이지로 리다이렉트됨

---

## Research
- next-auth **미설치** — `pnpm add next-auth@5` 필요 (`package.json`)
- `.env.example`에 `AUTH_SECRET`, `NEXTAUTH_URL` 이미 있음, `GITHUB_ID`/`GITHUB_SECRET` 추가 필요 (`.env.example`)
- `ensureDevUser()` 호출 3곳: `src/lib/bits.ts:101`, `src/lib/rebits.ts:10`, `src/lib/rebits.ts:23`
- `ensureDevUser()` 구현: email 기준 upsert, `dev@dailybit.dev` 고정 (`src/lib/bits.ts:14-21`)
- Prisma User 모델: id, email(unique), nickname(unique), bio, image, createdAt, updatedAt — Account/Session 모델 없음 (`prisma/schema.prisma:10-22`)
- API 라우트: `/api/bits`, `/api/bits/[id]`, `/api/rebits` 존재, `/api/auth/[...nextauth]` 없음 (`src/app/api/`)
- 루트 레이아웃 SessionProvider 미적용 (`src/app/layout.tsx`)
- 홈 페이지: BitComposer + BitList, `force-dynamic` (`src/app/page.tsx`)
- nickname 컬럼 `@unique` 제약 — GitHub 로그인 시 닉네임 충돌 가능성 있음

## Decisions

### D1: 닉네임 전략
- **Status**: resolved
- **Rationale**: 첫 로그인 시 nickname이 없는 User로 생성 후 `/onboarding`으로 리다이렉트. onboarding 페이지에서 닉네임 입력/저장. 자동 할당(GitHub username) 옵션도 검토했으나 충돌 처리 복잡도와 UX 품질 이유로 명시적 설정 방식 채택.

### D2: 보호 라우트 범위
- **Status**: assumed
- **Rationale**: 피드 읽기는 비로그인도 가능(공개). Bit 작성·Rebit 등 write 액션만 인증 필요. 표준 SNS 패턴.

### D3: 미인증 write 시도 처리
- **Status**: resolved
- **Rationale**: BitComposer 클릭 또는 API POST/DELETE 시 미인증이면 로그인 페이지로 리다이렉트. 비활성 UI보다 명확한 진입 유도.

### D4: 로그인 후 리다이렉트
- **Status**: assumed
- **Rationale**: 홈(`/`)으로 이동. callbackUrl 보존은 구현 복잡도 증가 — 단순화 우선.

### D5: Session 전략
- **Status**: assumed
- **Rationale**: JWT 전략 (NextAuth v5 기본). Prisma Adapter 미사용 이유: 현재 스키마에 Account/Session 테이블 없음, 단일 provider이므로 수동 upsert로 충분. 추후 provider 추가 시 Adapter 도입 검토.

### D6: GitHub 계정 → User 연결
- **Status**: assumed
- **Rationale**: `signIn` 콜백에서 `prisma.user.upsert({ where: { email }, create: { email, nickname: null } })`. JWT 콜백에서 `token.userId`, `token.hasNickname` 저장. session 콜백에서 `session.user.id`, `session.user.hasNickname` 노출. **User 행은 signIn 시점에 생성** (nickname null 허용 — D10 참조).

### D7: ensureDevUser() 대체
- **Status**: assumed
- **Rationale**: `getAuthUser()` 헬퍼 신규 작성 — `auth()` 호출 후 `session.user.id` 반환, 미인증 시 401 throw. 교체 대상: `POST /api/bits`, `DELETE /api/bits/[id]`, `POST /api/rebits`, `DELETE /api/rebits` 4개 라우트. `DELETE /api/bits/[id]`는 소유권 체크(`bit.authorId === user.id`) 추가.

### D8: Onboarding 강제
- **Status**: assumed
- **Rationale**: middleware에서 세션 있고 `session.user.hasNickname === false`이면 `/onboarding` 외 차단. JWT payload 사용으로 DB 조회 없음. onboarding 완료 후 NextAuth `update()` 호출해 JWT 갱신.

### D9: 기존 devuser 데이터
- **Status**: assumed
- **Rationale**: 데이터 마이그레이션 없음. 기존 `devuser` Bit·Rebit는 dev DB에만 존재, 운영 영향 없음. 스키마 마이그레이션(D10)은 별도.

### D10: 스키마 변경 — nickname nullable
- **Status**: assumed
- **Rationale**: `nickname String @unique` → `nickname String? @unique`로 변경. signIn 시 nickname 없이 User 생성 필요. Prisma migration 1회 실행. **D6 signIn 콜백 배포 전에 반드시 먼저 실행해야 함** — 순서: D10(migration) → D6(코드) 배포.

### D11: GitHub private email 처리
- **Status**: assumed
- **Rationale**: GitHub noreply 이메일 fallback — `{githubId}+{login}@users.noreply.github.com` 사용. GitHub OAuth는 이 주소를 `profile.email` 대신 제공하거나 `profile.id`로 조합. email NOT NULL 제약 유지.

### D12: CSRF 보호
- **Status**: assumed
- **Rationale**: NextAuth v5 세션 쿠키는 `SameSite=Lax HttpOnly` 기본값. 커스텀 Route Handler(/api/bits 등)는 동일 출처 요청만 허용하므로 추가 CSRF 구현 불필요.

## Constraints
- `nickname` 컬럼 `@unique` — onboarding API에서 서버사이드 중복 체크 필수 (클라이언트 검증만으로 부족, race condition 가능)
- JWT에 민감 정보(token, secret) 저장 금지
- `AUTH_SECRET` 환경변수 필수 (없으면 NextAuth 구동 불가)
- `pnpm only` — npm/yarn 사용 금지

## Known Gaps
- GitHub OAuth App 생성 및 `GITHUB_ID`/`GITHUB_SECRET` 환경변수 설정은 사람이 직접 수행 필요 (구현 태스크에 안내 포함)

## Confirmed Goal
NextAuth.js v5로 GitHub OAuth 로그인/로그아웃을 구현한다. 현재 `ensureDevUser()` 하드코딩 패턴을 실제 세션 기반 인증으로 대체하고, 로그인한 GitHub 계정 정보를 DB User 레코드와 연결한다. 브라우저에서 GitHub로 로그인하면 DB에 User 레코드가 생성/연결되고, 로그아웃하면 세션이 종료된다.
