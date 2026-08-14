# DentalCare AI

Implementation-ready TypeScript web application repository for the Dental Appointment Management System.

This repository is a **modular monolith** with a separate notification worker. M0 establishes tooling and application shells only. Patient, Appointment, and Notification business behavior is out of scope until later milestones.

## Technology baseline (TDA-IMP-M0-002)

| Layer     | Choice                                |
| --------- | ------------------------------------- |
| Web       | Next.js 15 + React 19 + TypeScript    |
| Worker    | Node.js + TypeScript                  |
| Database  | PostgreSQL + Prisma                   |
| Workspace | pnpm                                  |
| Tests     | Vitest + Playwright                   |
| Quality   | ESLint + Prettier + TypeScript strict |

## Prerequisites

- Node.js 22 LTS
- pnpm 10
- Docker (optional, for local PostgreSQL)

## Local setup

```bash
pnpm install
cp .env.example .env
# Edit .env and replace DATABASE_URL placeholders. Do not commit .env.

# Optional local database
docker compose up -d

pnpm db:generate
pnpm dev          # web shell — http://localhost:3000
pnpm dev:worker   # worker shell
```

## Validation commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm db:validate
pnpm build
pnpm security:secrets
```

Playwright (after `pnpm build`):

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

## Repository layout

```
apps/web/                 Next.js application shell
apps/worker/              Notification worker shell (no processing in M0)
packages/domain/          Domain boundaries: foundation, patient, appointment, notification
packages/application/     Application-service placeholders per boundary
packages/db/              Prisma schema, client, migrations
packages/contracts/       Shared technical contracts
packages/config/          Typed environment validation
packages/test-utils/      Test helpers
tests/e2e/                Playwright smoke tests
tests/integration/        Infrastructure tests
docs/                     Architecture, ADRs, governance
.cursor/rules/            Cursor governance
```

Controlled Word/PDF source documents remain at the repository root and must be preserved.

## Security

- Commit `.env.example` only. Never commit secrets.
- Configuration fails fast on missing mandatory values and does not print secret values.
- Authentication provider selection is deferred to M1 / the identity ADR.
- Formal security hardening is M5.

## Milestones

| ID  | Scope                                     |
| --- | ----------------------------------------- |
| M0  | Repository & tooling baseline (this work) |
| M1  | Foundation & Identity                     |
| M2  | Patient                                   |
| M3  | Appointment                               |
| M4  | Notification                              |
| M5  | Security hardening                        |
| M6  | E2E & operations                          |
| M7  | Production readiness                      |
