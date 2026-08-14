# Technology Stack — M0 Baseline

Status: Applied from TDA-IMP-M0-002 (DECISION BASELINE); formalized for this repository by TDA-ADR-001 v1.0 (PROPOSED — READY FOR HUMAN APPROVAL)
Date: 2026-08-14
Authoritative ADR: `docs/adr/TDA-ADR-001_Technology-Stack-and-Architecture-Reconciliation_v1.0.md`

## Selected stack

| Layer                    | Selection                  | Version pin (M0)                                         |
| ------------------------ | -------------------------- | -------------------------------------------------------- |
| Runtime                  | Node.js LTS                | 22.x                                                     |
| Package manager          | pnpm                       | 10.33.3 (`packageManager` field)                         |
| Web framework            | Next.js (App Router)       | 15.5.23                                                  |
| UI                       | React                      | 19.2.8                                                   |
| Language                 | TypeScript (strict)        | 5.9.3                                                    |
| Validation               | Zod                        | 3.25.76                                                  |
| Database                 | PostgreSQL                 | 16 local (docker-compose); production version is ADR-002 |
| ORM / migrations         | Prisma                     | 6.19.3                                                   |
| Worker                   | Node.js + TypeScript       | same Node 22                                             |
| Unit / integration tests | Vitest                     | 3.2.4                                                    |
| Browser E2E              | Playwright                 | 1.55.1                                                   |
| Lint                     | ESLint + typescript-eslint | 9.39.1 / 8.46.4                                          |
| Format                   | Prettier                   | 3.6.2                                                    |
| Config                   | Zod-validated environment  | `@dentalcare/config`                                     |

## Architecture

- Modular monolith
- One web/API application (`apps/web`)
- One notification worker process (`apps/worker`)
- One PostgreSQL database
- Domain boundaries: Foundation, Patient, Appointment, Notification
- Notification path: business transaction → PostgreSQL outbox → worker → provider adapter → SMTP/Twilio
- No microservices, Redis, Kafka, RabbitMQ, or other brokers in M0

## Identity provider (proposed)

TDA-ADR-003 v1.0 (PROPOSED — READY FOR HUMAN APPROVAL) selects **Amazon Cognito user pools, Essentials plan**, as the managed OIDC identity provider. The application remains the source of truth for tenant context, membership, RBAC, and object-level authorization. See `docs/adr/TDA-ADR-003_Managed-Identity-Provider-Selection_v1.0.md`.

Do not add Cognito/Auth0/Clerk SDKs, login routes, or identity tables until that ADR is human-approved.

## Explicit non-selections at M0

- No custom authentication/password system
- No managed auth provider deep integration (vendor named in TDA-ADR-003; not implemented in M0)
- No Patient / Appointment / Notification business schema or UI
- No production deployment topology
