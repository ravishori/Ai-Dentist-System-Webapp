# DentalCare AI

Implementation-ready TypeScript web application repository for the Dental Appointment Management System.

This repository is a **modular monolith** with a separate notification worker. M0–M2 establish tooling, authentication, and organization-tenant authorization. M3 adds organization-scoped patient identity. M4 adds organization-scoped appointments. M5 delivers appointment outbox intents by email through a disabled-by-default worker. Real SMTP stays off until explicit production configuration is present.

## Technology baseline (TDA-IMP-M0-002 / TDA-ADR-001)

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

## Staging hosting (proposed)

Staging container/Render configuration is documented in `docs/STAGING-HOSTING.md` and proposed in `docs/adr/ADR-IMP-005-staging-hosting-render.md`. It is **not** production deployment and does **not** configure `dental.trinetralab.net`.

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
apps/worker/              Notification worker (disabled by default; fake adapter in tests)
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
- Authentication uses Amazon Cognito User Pools behind `AuthenticationPort` (TDA-ADR-003). Authorization uses application-owned membership/RBAC behind `AuthorizationPort` (TDA-ADR-002). Patient records and appointments are organization-scoped and authorized object-by-object. Notification delivery uses `NotificationDeliveryPort` and is disabled by default.
- Formal security hardening remains a later milestone.

## Milestones

| ID  | Scope                                          |
| --- | ---------------------------------------------- |
| M0  | Repository & tooling baseline                  |
| M1  | Authentication foundation                      |
| M2  | Authorization & organization/tenant foundation |
| M3  | Patient domain foundation                      |
| M4  | Appointment domain                             |
| M5  | Notification delivery (this increment)         |
