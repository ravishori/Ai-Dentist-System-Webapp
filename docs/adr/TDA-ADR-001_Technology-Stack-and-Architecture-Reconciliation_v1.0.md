# TDA-ADR-001 — Technology Stack & Architecture Reconciliation

| Field                                        | Value                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **ADR ID**                                   | TDA-ADR-001                                                                                                                     |
| **Title**                                    | Technology Stack & Architecture Reconciliation                                                                                  |
| **Version**                                  | 1.0                                                                                                                             |
| **Status**                                   | PROPOSED — READY FOR HUMAN APPROVAL                                                                                             |
| **Date**                                     | 14 August 2026                                                                                                                  |
| **Repository**                               | `ravishori/Ai-Dentist-System-webapp`                                                                                            |
| **Change class**                             | C3 (major architecture decision) per TDA-GOV-CMP-001                                                                            |
| **Supersedes (this repository, stack only)** | TDA-TDD-001 v1.1 FastAPI / Python / Celery (or equivalent) / optional Redis direction                                           |
| **Implements / formalizes**                  | TDA-IMP-M0-002 v1.0 Decision Baseline                                                                                           |
| **Working predecessor**                      | `docs/adr/ADR-M0-001-typescript-modular-monolith.md`                                                                            |
| **Does not supersede**                       | Domain, DDD, API, security, QA, or product-requirement documents except where they defer stack/worker/queue selection to an ADR |

AI-generated documentation is non-authoritative until reviewed and approved (TDA-GOV-SOT-001 §16, TDA-GOV-CMP-001 §14). This ADR is submitted for human architectural approval. Until that approval, it is the recorded reconciliation of the M0 conflict; it must not be treated as silently self-approved.

---

## 1. ADR ID

TDA-ADR-001

## 2. Title

Technology Stack & Architecture Reconciliation for the Ai-Dentist-System-webapp repository

## 3. Status

PROPOSED — READY FOR HUMAN APPROVAL

Upon human approval, this ADR becomes the authoritative implementation architecture for this repository under TDA-GOV-SOT-001 Priority 1 (Approved Governance / ADR).

## 4. Date

14 August 2026

## 5. Context

DentalCare AI is being implemented in a documentation-first repository that already contains controlled product, architecture, domain, database, API, security, QA, and implementation documents.

M0 (TDA-IMP-M0-002) converted this repository into an implementation-ready TypeScript web-application workspace on branch `cursor/m0-repository-baseline-3efc`. The M0 baseline passed local technical validation (install, lint, format, typecheck, unit/integration tests, Prisma validate, web build, worker build, Playwright smoke, secret scan, production dependency audit).

TDA-GOV-SOT-001 requires that a conflict between potentially authoritative sources be recorded and resolved rather than guessed. TDA-GOV-CMP-001 classifies introduction or removal of frameworks and persistence/worker mechanisms as a material (C2/C3) architecture change that must be captured in an ADR.

This ADR is that resolution for **this repository only**.

## 6. Problem Statement

Two controlled documents describe different implementation stacks for backend/web runtime and background work:

- One document (TDA-TDD-001 v1.1) is a REVIEW-stage technical design that prefers FastAPI/Python and Celery-or-equivalent workers, with Redis as optional cache/coordination.
- Another document (TDA-IMP-M0-002 v1.0) is a DECISION BASELINE that selects Next.js/React/TypeScript, PostgreSQL/Prisma, a Node.js/TypeScript worker, and a PostgreSQL transactional outbox with no message broker initially.

M0 has already implemented the second baseline. Continuing without a named ADR would leave implementers, Cursor, and reviewers without a single authoritative stack for this web-application repository.

The problem is not whether FastAPI/Python can be a valid architecture in general. The problem is which stack is authoritative **for Ai-Dentist-System-webapp**.

## 7. Existing Conflict

### Document A — TDA-TDD-001 v1.1

| Field                           | Value                                               |
| ------------------------------- | --------------------------------------------------- |
| Document                        | DentalCare AI Volume 03 — Technical Design Document |
| ID                              | TDA-TDD-001                                         |
| Version                         | 1.1                                                 |
| Status                          | REVIEW (not APPROVED, not BASELINED)                |
| Authority under TDA-GOV-SOT-001 | Provisional; do not treat as final                  |

Relevant direction in TDD §23 Technology Baseline and related sections:

- Web admin: React + TypeScript
- Backend: FastAPI + Python
- Workers: Celery or approved equivalent; final worker/queue selection requires an ADR if not already baselined
- Database: PostgreSQL
- Cache/coordination: Redis (not system of record)

TDD also baselines the Appointment → History → Audit → Notification Outbox → Dispatcher architecture, which is independent of FastAPI vs Next.js.

### Document B — TDA-IMP-M0-002 v1.0

| Field     | Value                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------- |
| Document  | Repository Baseline & Technology Stack Decision                                                    |
| ID        | TDA-IMP-M0-002                                                                                     |
| Version   | 1.0                                                                                                |
| Status    | DECISION BASELINE                                                                                  |
| Authority | Controlled decision for converting this documentation repository into a web-application repository |

Relevant direction:

- Next.js + TypeScript web/API application
- React UI
- PostgreSQL + Prisma
- Node.js + TypeScript notification worker
- Modular monolith (not microservices)
- PostgreSQL transactional outbox; no Redis/broker in M0 unless an approved requirement proves it necessary
- Vitest + Playwright + integration tests
- pnpm workspace

### Conflict classification

This is a material stack conflict for runtime, worker technology, and optional Redis. It is **not** a conflict about:

- PostgreSQL as the transactional system of record (both agree)
- Modular structure over premature microservices (TDD prefers modular; M0-002 requires modular monolith)
- Transactional outbox and asynchronous provider calls (both require this invariant)
- React + TypeScript for web administrative experience (TDD already prefers this)

### Authority determination (TDA-GOV-SOT-001)

1. TDA-TDD-001 v1.1 is REVIEW, therefore provisional.
2. TDA-IMP-M0-002 v1.0 is a decision baseline for this repository conversion.
3. TDD §23 / ADR-006 states that final worker/queue selection requires an ADR if not already baselined.
4. No APPROVED or BASELINED document mandates FastAPI/Python for this web-application repository.
5. M0 source code is implementation evidence, not a license to ignore documentation; this ADR is the documentation resolution.

No additional material architecture conflict was found that would block recording this decision. Remaining open decisions are listed in §21 and are deferred, not contradictory.

## 8. Decision

For repository `ravishori/Ai-Dentist-System-webapp`, the authoritative implementation architecture is:

**One TypeScript modular monolith web/API application + one PostgreSQL database + one Node.js/TypeScript background worker**, with PostgreSQL transactional outbox for notifications and no message broker in the initial implementation.

TDA-TDD-001 v1.1 remains in the document set as a REVIEW-stage/provisional architecture document. Its FastAPI/Python/Celery (or equivalent) and optional-Redis stack direction is **superseded for this repository’s implementation baseline** by this ADR. The historical TDD text is not deleted and is not silently rewritten.

## 9. Detailed Architecture

```
Client (web)
    ↓
apps/web  — Next.js + React + TypeScript
            (UI + /api/v1 application boundary)
    ↓
Application services  (packages/application)
    ↓
Domain modules        (packages/domain)
    ├── Foundation
    ├── Patient
    ├── Appointment
    └── Notification
    ↓
Data access           (packages/db — Prisma)
    ↓
PostgreSQL            (single transactional database)
```

Background path:

```
Committed notification_outbox rows
    ↓
apps/worker  — Node.js + TypeScript
    ↓
Provider adapters
    ├── SMTP (email)
    └── Twilio (SMS)
```

Deployment topology for the initial implementation:

- One web/API application
- One PostgreSQL database
- One background worker process/service
- Clear in-process domain boundaries
- **Not** microservices
- **Not** Redis, Kafka, RabbitMQ, or other brokers unless a later approved requirement/ADR introduces one

API public versioning remains `/api/v1` as specified by TDA-API-001. This ADR does not change API resource contracts.

M0 established shells and tooling only. Foundation, Patient, Appointment, and Notification **business** behavior remains owned by later milestones and their domain/DDD/API documents.

## 10. Technology Stack

| Layer                  | Authoritative selection for this repository       | Notes                                                         |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| Web UI                 | Next.js + React + TypeScript                      | Administrative/web application in this repo                   |
| API boundary           | Next.js server/API routes initially               | TDA-API-001 contracts still govern resources, errors, authz   |
| Application / domain   | TypeScript modules independent of UI              | Domain logic must not live in controllers                     |
| Database               | PostgreSQL                                        | System of record                                              |
| ORM / migrations       | Prisma                                            | Schema evolution is migration-controlled                      |
| Background worker      | Node.js + TypeScript                              | Separate process from the web app                             |
| Notification transport | PostgreSQL transactional outbox                   | No broker initially                                           |
| Email                  | SMTP through provider adapter                     | Provider product choice remains open                          |
| SMS                    | Twilio through provider adapter                   | Account/product configuration remains open                    |
| Auth                   | Managed provider behind application authorization | Provider product is **not** selected by this ADR              |
| Testing                | Vitest + integration tests + Playwright           | Aligns with TDA-QA-001 levels; exact CI platform remains open |
| Package management     | pnpm                                              | Workspace + lockfile                                          |
| Runtime                | Current Node.js LTS, pinned in the repository     | M0 uses Node 22.x                                             |
| Cache / broker         | Not part of the initial architecture              | Redis is not required to start                                |

Exact package versions in the repository are implementation pins from M0, not a claim that those versions are frozen for production without change control.

## 11. Domain Boundary Model

Domain boundaries are mandatory. Package count is not.

| Module       | Owns                                                                 | Must not own                       |
| ------------ | -------------------------------------------------------------------- | ---------------------------------- |
| Foundation   | Identity, tenant context, authorization primitives, audit foundation | Patient/appointment business rules |
| Patient      | Profile, contacts, preferences, patient history                      | Appointment scheduling             |
| Appointment  | Scheduling, lifecycle, conflicts, appointment history                | Provider delivery                  |
| Notification | Outbox processing, templates, attempts, provider adapters            | Appointment lifecycle decisions    |

These boundaries match TDA-IMP-M0-002 §8 and are already encoded as modules under `packages/domain` and `packages/application`.

## 12. Notification Architecture

Authoritative flow:

```
Business Mutation
      ↓
ONE PostgreSQL Transaction
      ├── Business state
      ├── History
      ├── Audit
      └── Notification Outbox
                ↓ COMMIT
          Notification Worker
                ↓
          Provider Adapter
             ┌──┴──┐
             ↓     ↓
           SMTP  Twilio
```

Rules:

- Appointment mutation + history + audit + notification outbox = one database transaction (TDA-TDD-001 controlled invariant; TDA-CURSOR-EXEC-001; TDA-IMP-M0-002).
- External provider calls MUST NOT execute inside the originating business transaction.
- Provider failure MUST NOT roll back a committed business transaction.
- Worker execution is asynchronous, durable, and retryable.
- Exactly-once external delivery must not be assumed.
- SMTP and Twilio remain behind adapters; SDKs must not leak into the domain layer.

This ADR selects the **worker runtime** (Node.js/TypeScript) and **outbox substrate** (PostgreSQL). It does not implement notification processing; that remains M4.

## 13. Alternatives Considered

### Alternative 1 — FastAPI/Python backend + Celery worker in this repository

Follow TDA-TDD-001 §23 literally: React admin plus a Python API and Celery-or-equivalent workers, optionally Redis.

Rejected for this repository at this time because M0 has already established a validated TypeScript workspace, TDD is REVIEW rather than BASELINED, and adopting Python now would discard the M0 baseline and introduce dual-runtime operational cost without an approved requirement that this webapp must be Python.

### Alternative 2 — Split repositories / split runtimes

Keep this repository as Next.js UI only and implement a separate FastAPI service.

Rejected for the initial implementation. TDA-IMP-M0-002 requires one web/API application initially. A split would be a microservices-adjacent topology and is premature.

### Alternative 3 — Next.js UI + Python worker only

Use TypeScript for HTTP and Python for notifications.

Rejected: two languages for a single modular monolith increases tooling, CI, and hiring/review cost without a demonstrated notification-scale requirement.

### Alternative 4 — Introduce Redis/Kafka/RabbitMQ now

Rejected: TDA-IMP-M0-002 and this ADR require PostgreSQL outbox first. Brokers may be reconsidered only with an approved scale/reliability requirement.

## 14. Why FastAPI/Python Was Not Selected for this repository

This is not a claim that FastAPI/Python is an inferior architecture in general.

It was not selected **for Ai-Dentist-System-webapp** because:

1. TDA-TDD-001 v1.1 is REVIEW, not APPROVED/BASELINED.
2. TDA-IMP-M0-002 already decided a TypeScript web-application baseline for this repository.
3. M0 has implemented and technically validated that baseline.
4. TDD itself defers final worker/queue technology to an ADR.
5. Reversing M0 to Python would create architectural churn, a second runtime, and a discarded lockfile/tooling baseline without a higher-authority approved mandate.
6. The durable business invariants (PostgreSQL, outbox, tenant isolation, domain boundaries) do not require FastAPI.

If a future approved product decision requires a Python service, that is a new C3 change and a new ADR. It is not the current baseline.

## 15. Why Next.js/TypeScript Was Selected

Selected for this repository because:

- M0 already implemented it and passed its technical validation gate.
- It keeps web UI, API boundary, domain, persistence, and worker in one language (TypeScript end-to-end development).
- It matches TDD’s own preference for React + TypeScript on the web administrative surface.
- It supports a simpler initial deployment model: one web/API app, one database, one worker.
- It preserves clear modular domain boundaries without microservices.
- PostgreSQL transactional requirements are met through Prisma + database constraints; they are not unique to Python.
- A separate asynchronous Node worker can implement the outbox/dispatcher pattern required by TDD and the implementation plans.
- Project governance (TDA-IMP-M0-002, TDA-IMP-001 phase 0, TDA-CURSOR-EXEC-001) directed M0 to this stack unless an approved document required otherwise. No such approved document exists.

## 16. Consequences

After human approval of this ADR:

- Implementation in this repository follows Next.js / React / TypeScript / PostgreSQL / Prisma / Node worker / pnpm.
- Cursor and reviewers treat TDA-TDD-001 FastAPI/Python/Celery stack text as historical/provisional for this webapp, not as a live implementation order.
- TDA-TDD-001 remains in force for non-stack architecture that does not conflict, including the outbox invariant, tenant isolation, and modular-over-distributed principle, until that TDD is revised.
- Introducing FastAPI, Celery, Redis, Kafka, RabbitMQ, or microservices in this repository requires a new ADR and TDA-GOV-CMP-001 change control.
- TDA-TDD-001 should be revised before it is APPROVED/BASELINED so Volume 03 no longer lists FastAPI/Celery as the preferred backend **for this web-application repository**, or so a documented split (for example a future mobile/Python surface) is explicit.
- M1–M7 proceed on the M0 TypeScript baseline.

## 17. Risks

- Human approval of this ADR is still required; until then TDD REVIEW text can be misread as current.
- A later decision to restore Python would be expensive after M1–M4 TypeScript work.
- Next.js as the initial API boundary may later need extraction; that would be a future ADR, not a hidden microservice.
- Production Node/PostgreSQL/Prisma topology, observability, and hosting are not decided here.
- M0 used pnpm overrides for transitive `postcss`/`sharp` audit findings; framework upgrades remain change-controlled.

## 18. Migration / Impact Assessment

| Area                                          | Impact                                                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application code                              | None required by this ADR. M0 already matches the decision.                                                                                         |
| Database / Prisma schema                      | None. No business tables are created by this ADR.                                                                                                   |
| APIs                                          | None. Resource contracts remain in TDA-API-\* documents.                                                                                            |
| Authentication                                | None. Provider remains an open decision.                                                                                                            |
| Patient / Appointment / Notification features | None. Still future milestones.                                                                                                                      |
| TDA-TDD-001.docx                              | Not rewritten. Historical file retained. Status/supersession recorded in governance docs.                                                           |
| Operations                                    | Future worker and web processes are Node.js, not Celery/Python, for this repository.                                                                |
| Rollback                                      | Rejecting this ADR before approval returns the stack question to unresolved conflict; it does not automatically convert the M0 codebase to FastAPI. |

## 19. Relationship to TDA-TDD-001

TDA-TDD-001 v1.1 is a REVIEW-stage/provisional architecture document. It is **not** deleted, ARCHIVED, or silently rewritten.

| TDD topic                                                 | Treatment after this ADR                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| FastAPI + Python backend                                  | Superseded for this repository                                                                     |
| Celery or approved equivalent worker                      | Superseded for this repository; Node.js/TypeScript worker is the approved equivalent for this repo |
| Optional Redis                                            | Not part of the initial implementation; still not system of record                                 |
| PostgreSQL as system of record                            | Confirmed                                                                                          |
| Modular over unnecessarily distributed                    | Confirmed                                                                                          |
| React + TypeScript web admin                              | Confirmed and extended to the Next.js web/API app in this repo                                     |
| Appointment + history + audit + outbox in one transaction | Confirmed; unchanged                                                                               |
| Provider calls outside the originating transaction        | Confirmed; unchanged                                                                               |
| Flutter mobile                                            | Out of scope for this repository; this ADR does not decide mobile                                  |
| TDD-listed ADRs 002, 005, 007, 008                        | Remain open where not decided here                                                                 |

When TDD is later revised toward APPROVED/BASELINED, Volume 03 §23 should be updated through normal change control so it no longer conflicts with this ADR for this webapp.

## 20. Relationship to TDA-IMP-M0-002

TDA-IMP-M0-002 v1.0 remains the M0 execution/decision baseline that created the repository skeleton.

This ADR:

- does not replace the M0 milestone plan;
- does not reopen Patient/Appointment/Notification implementation;
- formalizes the stack/architecture choice that M0 applied;
- is the named architecture decision TDD required for worker/queue technology;
- is the conflict-resolution record required by TDA-GOV-SOT-001.

`docs/adr/ADR-M0-001-typescript-modular-monolith.md` is a working M0 note. After approval of TDA-ADR-001, that note is a historical pointer, not a second competing stack decision.

## 21. Open Decisions

This ADR does **not** finalize the following. No values are invented.

| Decision                                                   | Freeze before (from TDA-IMP-M0-002 unless noted)          |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| Authentication provider                                    | M1 security implementation                                |
| Hosting platform                                           | M7; preferably before production CI/CD topology is frozen |
| Production PostgreSQL version and topology                 | Before production (TDD ADR-002)                           |
| Observability platform                                     | M6/M7                                                     |
| Backup / RPO / RTO                                         | M7                                                        |
| Production domain / DNS                                    | Production                                                |
| Email provider (SMTP product/vendor)                       | M4 staging                                                |
| SMS provider account/configuration beyond “Twilio adapter” | M4 production                                             |
| Production deployment topology                             | M7 (TDA-IMP-001 ADR-IMP-005)                              |

Also still open and not decided here: AI gateway/model provider, object-storage strategy, CI/CD platform confirmation beyond the M0 GitHub Actions baseline, and any future broker/cache requirement.

## 22. Approval Requirement

| Role                        | Action                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| Architect / Technical Owner | Approve or reject this ADR (TDA-GOV-SOT-001 §18)                    |
| Human reviewer              | Confirm no FastAPI mandate exists in an APPROVED/BASELINED document |
| Cursor / implementation     | Must not self-approve (TDA-GOV-CMP-001 §14)                         |

Until approved, implementation in this repository should continue to follow the already-built M0 TypeScript baseline and must not switch to FastAPI/Python without stopping and reporting.

After approval, update TDA-TDD-001 through a separate governed revision before that TDD is BASELINED.

## 23. Change History

| Version | Date           | Author                                                       | Change                                                                                |
| ------- | -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1.0     | 14 August 2026 | Cursor (governance task TDA-ADR-001), pending human approval | Initial reconciliation of TDA-TDD-001 v1.1 vs TDA-IMP-M0-002 v1.0 for this repository |
