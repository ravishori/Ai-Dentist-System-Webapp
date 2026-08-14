# ADR-M0-001 — TypeScript modular monolith for the web-application repository

Status: Proposed / applied as TDA-IMP-M0-002 DECISION BASELINE
Date: 2026-08-14
Milestone: M0

## Decision

Use a TypeScript modular monolith with a separate Node.js notification worker for repository `ravishori/Ai-Dentist-System-webapp`:

- Next.js + React + TypeScript for the web/API application
- PostgreSQL + Prisma for persistence and migrations
- Node.js + TypeScript worker for future notification dispatch
- pnpm workspace
- PostgreSQL transactional outbox (no message broker in M0)

## Why this is not a silent override of TDD

TDA-TDD-001 v1.1 (status REVIEW) lists FastAPI/Python as the preferred backend baseline and Celery-or-equivalent as the preferred worker, with Redis as optional cache/coordination.

TDA-IMP-M0-002 v1.0 is the controlled decision baseline that converts this documentation-first **web-application** repository into an implementation-ready TypeScript stack. TDA-TDD-001 also states that final worker/queue selection requires an ADR if not already baselined.

## Consequences

- M1–M7 implementation in this repository follows the TypeScript/Next.js/Prisma baseline.
- TDD v1.1 should be reconciled before it is APPROVED/BASELINED so it no longer lists FastAPI/Celery as the preferred backend for this webapp, or so a split (Flutter/mobile + Python API vs this webapp) is made explicit.
- Redis remains out of M0. Introducing it later requires an approved requirement or ADR.

## Rejected for M0

- Microservices
- Custom password authentication
- Inventing Patient/Appointment/Notification tables
- Message brokers
