# Technology Stack — M0 Baseline

Status: Applied from TDA-IMP-M0-002 (DECISION BASELINE)
Date: 2026-08-14

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

## Explicit non-selections at M0

- No custom authentication/password system
- No managed auth provider deep integration
- No Patient / Appointment / Notification business schema or UI
- No production deployment topology
