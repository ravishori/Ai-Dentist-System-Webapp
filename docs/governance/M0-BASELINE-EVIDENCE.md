# M0 Baseline Evidence Report

Status: PASS (local validation)
Date: 2026-08-14
Documents: TDA-IMP-M0-002 v1.0, TDA-IMP-M0-001 v1.0, TDA-IMP-001 v1.0

## Repository

- Path: `/workspace` (`ravishori/Ai-Dentist-System-Webapp`)
- Branch: `cursor/m0-repository-baseline-3efc`
- Existing user changes: none (working tree was clean on `main` before M0)
- Existing documentation at repository root: preserved, not modified

## Runtime

- Node.js 22.x (environment: v22.14.0 / v22.22.2)
- pnpm 10.33.3
- Next.js 15.5.23
- React 19.2.8
- TypeScript 5.9.3
- Prisma 6.19.3
- PostgreSQL 16 (local docker-compose image; no production version frozen)

## Commands executed

| Command                 | Result                                 |
| ----------------------- | -------------------------------------- |
| `pnpm install`          | PASS (lockfile written)                |
| `pnpm lint`             | PASS                                   |
| `pnpm format:check`     | PASS                                   |
| `pnpm typecheck`        | PASS                                   |
| `pnpm test`             | PASS (6 tests)                         |
| `pnpm db:validate`      | PASS                                   |
| `pnpm build`            | PASS (web + worker)                    |
| `pnpm test:e2e`         | PASS (2 Playwright tests)              |
| `pnpm security:secrets` | PASS                                   |
| `pnpm security:audit`   | PASS after `postcss`/`sharp` overrides |
| CI YAML parse           | PASS                                   |

## Database

- Technology: PostgreSQL + Prisma
- Migration mechanism: Prisma migrations (`packages/db/prisma/migrations`)
- Current schema: M0 baseline with **no domain models**
- `prisma validate` and `prisma generate` succeeded

## Configuration

- `.env.example` committed with placeholders only
- `.env` is gitignored and not tracked
- `loadConfig()` fails fast on missing/invalid `DATABASE_URL` without printing values
- Logger redacts secret-like keys

## Cursor

- Rules installed: `.cursor/rules/00-dentalcare-master.mdc`
- No additional conflicting rule files

## CI/CD

- Workflow: `.github/workflows/ci.yml`
- Checks: frozen-lockfile install, secret scan, lint, format, typecheck, unit tests, Prisma validate, build, prod audit, Playwright

## Risks / blockers

- TDA-TDD-001 v1.1 (REVIEW) still lists FastAPI/Python + Celery; M0 applied TDA-IMP-M0-002 TypeScript baseline. Human reconciliation required before TDD approval.
- Authentication provider is unset in code. TDA-ADR-003 v1.0 proposes Amazon Cognito user pools (Essentials) as the managed IdP. M1 cannot complete provider integration until TDA-ADR-001/002/003 are human-approved.
- Local `docker-compose.yml` uses a non-production local Postgres password for developer convenience.
- pnpm overrides pin `postcss@8.5.23` and `sharp@0.35.3` to clear Next.js 15.5.23 transitive audit findings. Revisit when Next.js is upgraded through an approved change.

## Stack reconciliation follow-up

TDA-ADR-001 v1.0 records the FastAPI/Python vs Next.js/TypeScript conflict and the repository-specific decision. See `docs/adr/TDA-ADR-001_Technology-Stack-and-Architecture-Reconciliation_v1.0.md`.

## Next milestone

M1 authentication foundation is implemented behind `AuthenticationPort`. Authorization/RBAC and Patient (M2) are not started. Production Cognito configuration remains human-owned.
