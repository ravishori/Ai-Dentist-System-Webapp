# TDA-M5 Notification Delivery Contract

**Status:** Implemented for M5 (Notification Delivery)  
**Date:** 2026-08-15  
**Depends on:** M0–M4, approved `docs/ADR-FOLLOWUP-M5.md`  
**Does not implement:** SMS, WhatsApp, push, calendar, marketing, bulk send, patient portal, production SMTP enablement

This document is the application-facing contract for M5. Architecture decisions remain in `docs/ADR-FOLLOWUP-M5.md` (APPROVED 2026-08-15).

---

## 1. Objective

M4 persists transactional notification **intent**. M5 consumes existing appointment outbox intents and may send **email** after commit, through a worker that is **disabled by default**.

```text
Appointment HTTP (create / reschedule / cancel)
        ↓
same transaction: appointment + history + security_events + notification_outbox (pending)
        ↓
Worker (optional, disabled by default)
        ↓
NotificationDeliveryPort
        ↓
Fake adapter (tests / explicit local dry-run)  |  SMTP adapter (production only, explicit)
```

Appointment HTTP handlers never call a notification provider.

---

## 2. Consent and recipient eligibility

Patient records gain additive fields (safe default: no consent / no delivery):

| Field                               | Default | Notes                                     |
| ----------------------------------- | ------- | ----------------------------------------- |
| `appointmentNotificationConsent`    | `false` | Explicit appointment-notification consent |
| `appointmentNotificationConsentAt`  | unset   | Set when consent is granted               |
| `appointmentNotificationOptOut`     | `false` | Explicit opt-out                          |
| `appointmentNotificationOptedOutAt` | unset   | Set when opted out                        |

Only the existing staff-side Patient PATCH flow may change these fields (`patient.update.tenant`). Create does not accept consent fields. There is no patient portal or self-service consent API.

A recipient is eligible only when all are true:

```text
patient is active
patient email is present and valid
explicit appointment-notification consent is present
patient has not opted out
notification processing is explicitly enabled
```

Ineligible intents are marked `suppressed` with a sanitized error category. Full recipient email and message bodies are not stored on the outbox row, in `security_events`, or in logs.

---

## 3. Delivery port and adapters

`NotificationDeliveryPort.deliver(message)` is provider-neutral. It does not expose HTTP, Prisma, or SMTP-library types.

| Mode     | When                                                                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| disabled | Default. Unset/invalid config. Fail closed: no provider call.                                                                                                                                  |
| fake     | `NOTIFICATION_PROCESSING_ENABLED=true`, `NOTIFICATION_PROVIDER=fake`, and `NODE_ENV` is not `production`                                                                                       |
| smtp     | Production + `NOTIFICATION_ALLOW_REAL_DELIVERY=true` + `NOTIFICATION_PROVIDER=smtp` + validated SMTP host/port/username/password + from-address whose domain equals `NOTIFICATION_FROM_DOMAIN` |

There is no hard-coded sender identity. Automated tests use the fake adapter only.

---

## 4. Outbox states and worker

Statuses: `pending`, `processing`, `sent`, `suppressed`, `failed_terminal`.

- Atomic claim (`FOR UPDATE SKIP LOCKED` in PostgreSQL; mutex in the in-memory store).
- Idempotency key = outbox `id`. A successful send is never sent again.
- Claim lease expires so interrupted work can be retried.
- Max attempts: 5.
- Transient backoff after attempts 1–4: 1 minute, 5 minutes, 30 minutes, 2 hours. After attempt 5 the intent is terminal (the listed 6-hour delay is not followed by a sixth automatic attempt).
- Permanent recipient, consent, opt-out, validation, and provider errors terminate immediately.

Worker polling interval defaults to **60 seconds**. Processing remains off unless explicit validated configuration enables it.

---

## 5. Templates and events

Only:

- `appointment.created`
- `appointment.rescheduled`
- `appointment.cancelled`

Templates may include the patient first name and appointment start/end rendered in the appointment timezone. They must not include diagnosis, treatment, medical history, payment data, authentication tokens, last name, email, phone, or date of birth.

---

## 6. HTTP

`GET /api/notifications/:outboxId` returns tenant-scoped delivery metadata (`notification.read`). Cross-tenant reads are `404`. PATIENT and SYSTEM_ADMIN are denied. The body never includes recipient email or message text.

---

## 7. Production prerequisites (not authorized by M5 implementation)

Real delivery additionally requires human-approved production SMTP credentials, a verified sender domain/from-address, `NOTIFICATION_ALLOW_REAL_DELIVERY=true`, `NOTIFICATION_PROCESSING_ENABLED=true`, and `NOTIFICATION_PROVIDER=smtp` in production. This contract does not authorize enabling those flags, deploying, or merging to `main`.
