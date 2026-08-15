# TDA-ADR-FOLLOWUP-M5

## M5 Notification Delivery — Human Architecture Decision Record

**Document ID:** TDA-ADR-FOLLOWUP-M5  
**Version:** 1.0  
**Status:** APPROVED  
**Date:** 2026-08-15  
**Milestone:** M5 — Notification Delivery  
**Depends on:** approved `docs/ADR-FOLLOWUP-M4.md` (M4-07 outbox intent; M4-19 delivery deferred)  
**Scope:** Asynchronous delivery of existing appointment outbox intents only  
This file is the approved M5 architecture decision record.

This approval authorizes M5 implementation **only** within the decisions below. It does **not** authorize production release, deployment, merge to `main`, SMS, WhatsApp, calendar delivery, or unrelated features.

---

# 1. Purpose

M4 persists transactional notification **intent**. M5 may consume those intents and send email according to the approved decisions in this document.

```text
APPROVED — M5 implementation authorized within M5-01 through M5-12 only
```

---

# 2. Verified M4 baseline (do not redesign)

Inspected on `cursor/m3-patient-domain-3efc` / `391bb52`:

- Appointment create, reschedule, and cancel write `notification_outbox` in the **same** Prisma `$transaction` as the appointment row, history, and `security_events`.
- Outbox event types already stored: `appointment.created`, `appointment.rescheduled`, `appointment.cancelled`.
- Outbox columns today: `id`, `organizationId`, `appointmentId`, `eventType`, `status` (default `pending`), `createdAt`.
- `apps/worker` starts with `processingEnabled: false` and an empty processor registry. It does **not** claim or send.
- Config may name `SMTP_*` and `TWILIO_*` placeholders. No adapter sends mail or SMS.
- Patient contact fields: optional `email`, optional `phone`. **No consent or opt-out fields exist yet.** M5-04 requires them before real delivery is enabled.
- PATIENT and SYSTEM_ADMIN remain denied on appointment APIs. Delivery must not create a patient portal.

M1–M4 architecture is not to be redesigned by M5.

---

# 3. Decision summary (approved)

| #     | Decision            | Approved decision                                                                                                            |
| ----- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| M5-01 | Initial channel     | Email only. SMS, WhatsApp, push, and calendar delivery deferred.                                                             |
| M5-02 | Provider boundary   | `NotificationDeliveryPort` + SMTP via validated env config.                                                                  |
| M5-03 | Sender identity     | Required production from-address/domain. No unsafe default.                                                                  |
| M5-04 | Recipient / consent | Valid patient email only; explicit consent and opt-out required before real delivery; skip inactive/missing/invalid/opt-out. |
| M5-05 | Message content     | First name + appointment logistics only. No clinical or extra PII.                                                           |
| M5-06 | Events              | Created, rescheduled, cancelled only.                                                                                        |
| M5-07 | Retry               | 5 total attempts; delays after 1–4: 1m / 5m / 30m / 2h; attempt 5 is terminal.                                               |
| M5-08 | Idempotency         | Atomic claim; stable key; no duplicate send after success or restart.                                                        |
| M5-09 | Worker              | Polling worker, 60s interval, **disabled by default**.                                                                       |
| M5-10 | Observability       | Minimal metadata; no secrets, bodies, or full recipient emails in logs/audit.                                                |
| M5-11 | Retention           | No automatic purge; separate human-approved retention policy required.                                                       |
| M5-12 | Test / defaults     | Fake adapter in tests; unset/invalid config fails closed.                                                                    |

---

# 4. M5-01 — Initial channel

## Decision

```text
Initial delivery channel: email only.
SMS, WhatsApp, push notifications, and calendar delivery are deferred.
```

---

# 5. M5-02 — Provider boundary

## Decision

```text
Use a provider-neutral NotificationDeliveryPort.
Use an SMTP adapter configured only through validated environment configuration.
Do not commit provider credentials or bind domain/application code directly to a vendor SDK.
A future provider replacement must not require domain-model changes.
```

---

# 6. M5-03 — Sender identity

## Decision

```text
The from-address and verified sender domain are required production configuration.
There is no hard-coded sender identity and no unsafe default.
Real delivery remains disabled until the required production configuration is explicitly present.
```

---

# 7. M5-04 — Recipient, consent, opt-out, and inactive patient policy

## Decision

```text
Send only to a patient's valid email address.

Before real delivery is enabled, M5 must introduce explicit appointment-notification consent and opt-out state. A patient without explicit consent, with an opt-out, with a missing/invalid email, or with inactive status must not receive delivery.

The system must safely record a skipped/suppressed outcome without exposing recipient data.
```

---

# 8. M5-05 — Message-content privacy policy

## Decision

```text
Templates may include the patient's first name and appointment logistics necessary for the notification.

Do not include clinical data, diagnosis, treatment information, medical history, payment data, authentication tokens, or unnecessary personal data.
```

---

# 9. M5-06 — Events

## Decision

```text
Deliver only these existing outbox intents:
- appointment created;
- appointment rescheduled;
- appointment cancelled.

No marketing, bulk messaging, practitioner-availability, calendar, clinical, billing, or other event types are in M5 scope.
```

Existing outbox event type strings remain:

- `appointment.created`
- `appointment.rescheduled`
- `appointment.cancelled`

---

# 10. M5-07 — Retry and terminal-failure policy

## Decision

```text
Maximum delivery attempts: 5 total attempts.

For transient failures after attempts 1–4, retry after:
- 1 minute;
- 5 minutes;
- 30 minutes;
- 2 hours.

Attempt 5 is terminal. No sixth automatic attempt is made.

Non-retryable validation, consent, opt-out, recipient, or permanent provider errors terminate immediately.
```

A provider timeout or outage must **not** change appointment lifecycle state.

---

# 11. M5-08 — Claiming and idempotency

## Decision

```text
The worker must claim pending intents atomically and safely for concurrent workers.

Each outbox intent has a stable idempotency key. A successfully delivered intent must never be delivered again, including after worker restart or retry. Claim leases must expire safely so interrupted work can be retried without duplicate sending.
```

---

# 12. M5-09 — Worker execution

## Decision

```text
Use a controlled background polling worker with a 60-second configurable polling interval.

The worker is disabled by default. It must not run in test, local, preview, or production environments unless explicit validated configuration enables it.
```

Appointment HTTP requests must never call a notification provider.

---

# 13. M5-10 — Audit, observability, and safe logging

## Decision

```text
Record minimal delivery metadata: organization scope, outbox identifier, event type, state, attempt count, timestamps, provider message identifier where available, and sanitized error category/code.

Do not persist provider credentials, message bodies, full recipient email addresses, or sensitive provider responses in logs or audit metadata.
```

---

# 14. M5-11 — Metadata retention

## Decision

```text
M5 introduces no automatic deletion or purge of notification metadata.

Only minimal operational metadata is retained. A separate human-approved privacy, legal, and retention policy is required before a production retention or deletion schedule is introduced.
```

---

# 15. M5-12 — Test and safe-default policy

## Decision

```text
Automated tests use a fake/in-memory notification adapter only.

No test, local, or preview environment may send real messages. An unset or invalid notification configuration must fail closed: no provider call and no delivery attempt.
```

---

# 16. Explicitly out of scope for M5

```text
SMS
WhatsApp
Push notifications
Calendar integration
Patient portal / self-booking
Practitioner availability
Clinical records
Billing / payments / marketing / bulk campaigns
M1–M4 redesign
Production Cognito / DNS / deploy / main merge
Enabling real send by default
```

Delivery does **not** grant PATIENT or SYSTEM_ADMIN appointment API access.

---

# 17. Authorization of implementation

This approved record authorizes a later M5 implementation task to add:

- consent/opt-out state required by M5-04 (before real delivery is enabled)
- worker claim/delivery against existing outbox intents
- `NotificationDeliveryPort` and SMTP adapter behind env config
- fake adapter and tests
- additive schema for delivery metadata and consent as required by these decisions

It does **not** authorize production release, deployment, merge to `main`, SMS/WhatsApp, calendar delivery, or unrelated features.

---

# 18. HUMAN APPROVAL

## Approval Status

```text
APPROVED
```

## Approved By

```text
Name: Project Owner
Role: Project Owner
Date: 2026-08-15
```

## Human Approval Statement

I have reviewed the M5 Notification Delivery decisions in this document and approve them as the architectural basis for M5 implementation.

I understand that:

- M5 implementation will follow these decisions only.
- This approval does not authorize production release, deployment, or merge to `main`.
- This approval does not authorize SMS, WhatsApp, calendar delivery, or unrelated features.
- Enabling real delivery in any environment requires the required production configuration to be explicitly present.
- Future changes require a new or updated decision record.

```text
Human Approval:

[x] APPROVED
[ ] NOT APPROVED
```

---

# 19. Post-approval rule

This document is the M5 implementation source of truth.

Cursor must:

- follow M5-01 through M5-12
- not reinterpret them
- not enable real delivery by default
- not send SMS, WhatsApp, push, or calendar notifications
- not skip the consent/opt-out requirement
- not log secrets, message bodies, or full recipient emails

If implementation reveals a conflict: **STOP** and report it. Do not silently change the architecture.
