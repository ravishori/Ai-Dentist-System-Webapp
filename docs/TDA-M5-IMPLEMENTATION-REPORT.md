# TDA-M5 Implementation Report

**Milestone:** M5 Notification Delivery  
**Date:** 2026-08-15  
**Status:** Implemented on the M5 feature branch; **not production-ready**  
**Depends on:** M0–M4, approved `docs/ADR-FOLLOWUP-M5.md` (APPROVED 2026-08-15)  
**Does not redesign:** M1 authentication, M2 authorization evaluator, M3 patient identity, M4 appointment lifecycle or outbox intent writes

---

## 1. What was implemented

M5 consumes M4 `notification_outbox` intents and can send appointment emails through `NotificationDeliveryPort`. The worker stays **disabled by default**. Automated tests use a fake/in-memory adapter only.

```text
GET /api/notifications/:outboxId
        ↓
M1 session + M2 AuthorizationPort (notification.read)
        ↓
NotificationOutboxRepository.findByOrganizationAndId

Worker (optional)
        ↓
claim pending/expired-lease intents
        ↓
eligibility (active + email + consent + not opted out)
        ↓
NotificationDeliveryPort (fake | SMTP | fail-closed)
```

Architecture follows `docs/ADR-FOLLOWUP-M5.md`. The ADR file was not edited in this implementation.

---

## 2. Files created

### Domain

- `packages/domain/src/notification/delivery-port.ts`
- `packages/domain/src/notification/outbox.ts`

### Application

- `packages/application/src/notification/delivery-config.ts`
- `packages/application/src/notification/fake-adapter.ts`
- `packages/application/src/notification/fail-closed-adapter.ts`
- `packages/application/src/notification/smtp-adapter.ts`
- `packages/application/src/notification/create-delivery.ts`
- `packages/application/src/notification/eligibility.ts`
- `packages/application/src/notification/templates.ts`
- `packages/application/src/notification/retry.ts`
- `packages/application/src/notification/processor.ts`
- `packages/application/src/notification/in-memory-outbox.ts`
- `packages/application/src/notification/service.ts`
- `packages/application/src/notification/http.ts`
- `packages/application/src/notification/notification.security.test.ts`

### Persistence

- `packages/db/prisma/migrations/20260815140000_m5_notification_delivery/migration.sql`
- `packages/db/src/notification-store.ts`

### HTTP / worker

- `apps/web/src/app/api/notifications/[outboxId]/route.ts`
- `apps/web/src/infrastructure/notification/service.ts`

### Documentation

- `docs/TDA-M5-NOTIFICATION-CONTRACT.md`
- `docs/TDA-M5-IMPLEMENTATION-REPORT.md`

---

## 3. Files modified (additive)

Patient consent fields, outbox metadata, config flags, worker polling, health milestone `M5`, staff `notification.read`, tests, and supporting docs. M1–M4 Prisma migration files were **not** rewritten.

---

## 4. Consent / opt-out model

Safe default is **no consent / no delivery**. Staff PATCH `/api/patients/:id` with `patient.update.tenant` may set:

- `appointmentNotificationConsent` (timestamped when granted)
- `appointmentNotificationOptOut` (timestamped when set)

Create rejects those fields. No patient portal.

---

## 5. Delivery states, claim, retry

| Status            | Meaning                                  |
| ----------------- | ---------------------------------------- |
| `pending`         | Intent written by M4; claimable when due |
| `processing`      | Claimed under a lease                    |
| `sent`            | Provider accepted; never sent again      |
| `suppressed`      | Ineligible recipient; not retried        |
| `failed_terminal` | Permanent or exhausted transient failure |

Idempotency key: outbox `id`. Lease expiry allows recovery. Max attempts 5. Backoff after transient failures: 1m, 5m, 30m, 2h; fifth failure is terminal.

---

## 6. Configuration defaults (fail closed)

| Variable                             | Default |
| ------------------------------------ | ------- |
| `NOTIFICATION_PROCESSING_ENABLED`    | `false` |
| `NOTIFICATION_PROVIDER`              | `unset` |
| `NOTIFICATION_ALLOW_REAL_DELIVERY`   | `false` |
| `NOTIFICATION_POLL_INTERVAL_SECONDS` | `60`    |
| `NOTIFICATION_CLAIM_LEASE_SECONDS`   | `120`   |
| SMTP / from-address / domain         | unset   |

Real SMTP requires production + explicit allow-real-delivery + complete validated SMTP and sender settings. Test/local/preview cannot send real mail.

---

## 7. Tests

`packages/application/src/notification/notification.security.test.ts` covers eligibility, fake delivery, duplicate/concurrent claims, lease recovery, retry/terminal policy, appointment-state isolation, PII, cross-tenant deny, and fail-closed config.

Live PostgreSQL concurrent `SKIP LOCKED` is **not** executed in CI: CI `DATABASE_URL` is the `USER:PASSWORD` placeholder and no Postgres service is started. In-memory concurrent claim coverage is retained. See `tests/integration/notification-outbox-claim.test.ts`.

---

## 8. Validation

| Gate           | Command                 | Result                                                         |
| -------------- | ----------------------- | -------------------------------------------------------------- |
| Tests          | `pnpm test`             | PASS (149 tests)                                               |
| Lint           | `pnpm lint`             | PASS                                                           |
| Format         | `pnpm format:check`     | PASS                                                           |
| Typecheck      | `pnpm typecheck`        | PASS                                                           |
| DB validation  | `pnpm db:validate`      | PASS                                                           |
| Build          | `pnpm build`            | PASS (`/api/notifications/[outboxId]`)                         |
| Security audit | `pnpm security:audit`   | PASS (no known vulnerabilities; nodemailer 9.0.1)              |
| Secrets        | `pnpm security:secrets` | PASS                                                           |
| E2E            | `CI=true pnpm test:e2e` | PASS (6 tests)                                                 |

---

## 9. Production readiness blockers

- Human review of draft PR #6
- Production Cognito / DNS / credentials
- Production Postgres + backups
- Verified sender domain, from-address, and SMTP secrets (never committed)
- Explicit enablement of processing + real delivery (still off)
- Independent security/privacy review
- Retention/deletion policy (M5-11: none introduced)
- Deploy/rollback runbooks
- Merge to `main` is not authorized

---

## 10. Human Acceptance

```text
Status: IMPLEMENTED FOR DRAFT PR REVIEW — NOT PRODUCTION READY
```
