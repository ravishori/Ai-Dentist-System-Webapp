# TDA-ADR-FOLLOWUP-M5

## M5 Notification Delivery — Human Architecture Decision Record

**Document ID:** TDA-ADR-FOLLOWUP-M5  
**Version:** 1.0  
**Status:** PROPOSED — AWAITING HUMAN APPROVAL  
**Date:** 2026-08-15  
**Milestone:** M5 — Notification Delivery  
**Depends on:** approved `docs/ADR-FOLLOWUP-M4.md` (M4-07 outbox intent; M4-19 delivery deferred)  
**Scope:** Asynchronous delivery of existing appointment outbox intents only  
**This file is not an approved ADR.**

Agents and coding assistants must not mark this document approved.

No notification delivery implementation may begin until the decisions in this document are reviewed and the human approval section is completed as `APPROVED`.

---

# 1. Purpose

M4 already persists transactional notification **intent**. M5 would consume those intents and send messages. Delivery is blocked until the human project owner approves the decisions below.

```text
STOP — M5 IMPLEMENTATION BLOCKED
until this document is APPROVED
```

---

# 2. Verified M4 baseline (do not redesign)

Inspected on `cursor/m3-patient-domain-3efc` / `391bb52`:

- Appointment create, reschedule, and cancel write `notification_outbox` in the **same** Prisma `$transaction` as the appointment row, history, and `security_events`.
- Outbox event types already stored: `appointment.created`, `appointment.rescheduled`, `appointment.cancelled`.
- Outbox columns today: `id`, `organizationId`, `appointmentId`, `eventType`, `status` (default `pending`), `createdAt`.
- `apps/worker` starts with `processingEnabled: false` and an empty processor registry. It does **not** claim or send.
- Config may name `SMTP_*` and `TWILIO_*` placeholders. No adapter sends mail or SMS.
- Patient contact fields: optional `email`, optional `phone`. **No consent, opt-out, or marketing-preference fields exist.**
- PATIENT and SYSTEM_ADMIN remain denied on appointment APIs. Delivery must not create a patient portal.

M1–M4 code is not to be redesigned by M5.

---

# 3. Decision summary (proposed)

| #     | Decision            | Proposed decision                                                                                                   |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| M5-01 | Initial channel     | **Email only.** SMS and WhatsApp deferred.                                                                          |
| M5-02 | Provider boundary   | `NotificationDeliveryPort` + SMTP adapter. Credentials stay in env/secrets.                                         |
| M5-03 | Sender identity     | Configured `NOTIFICATION_FROM_EMAIL` (and optional display name). No default domain.                                |
| M5-04 | Recipient policy    | Use patient `email` if present and valid. Missing/invalid → terminal skip. Consent model **undefined** (see M5-04). |
| M5-05 | Message content     | Event + organization name + local appointment time. No clinical data, DOB, or full record.                          |
| M5-06 | Events              | Only the three existing outbox types.                                                                               |
| M5-07 | Retry               | Max 5 attempts; exponential backoff; retry timeouts/429/5xx; terminal on other 4xx.                                 |
| M5-08 | Idempotency         | Outbox row `id` is the delivery key; safe claim so two workers cannot double-send.                                  |
| M5-09 | Worker model        | Existing `apps/worker` polling process with `FOR UPDATE SKIP LOCKED`. Disabled by default.                          |
| M5-10 | Observability       | Attempt count, timestamps, error **code**, provider message id. No secret or body logs.                             |
| M5-11 | Retention / privacy | Do not persist message body or raw provider payloads. Metadata follows appointment RESTRICT.                        |
| M5-12 | Test / non-prod     | Fake adapter only in tests. Real send off unless explicitly configured **and** approved.                            |

These are **proposed**, not approved.

---

# 4. M5-01 — Initial channel

## Proposed

```text
Email only
```

SMS and WhatsApp are **not** in M5 unless the human changes this decision.

## Rationale

TDA-ADR-001 names SMTP and Twilio as future provider adapters. Starting with one channel limits secrets, templates, and failure modes. Patient `phone` remains unused for M5.

## Alternatives the human may select

1. Email only (proposed)
2. SMS only
3. Email and SMS
4. WhatsApp (not recommended; not in M4/M5 prompt unless explicitly approved)

## Human must confirm

Which channel(s) M5 may send.

---

# 5. M5-02 — Provider and adapter boundary

## Proposed

```text
NotificationDeliveryPort (application/domain boundary)
        ↓
SMTP adapter (infrastructure)  |  Fake adapter (tests)
```

- Domain and appointment HTTP handlers must **never** import SMTP/Twilio SDKs or call providers.
- Credentials: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` (already named in config). Never committed.
- If the human selects SMS, a Twilio adapter would use `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` the same way.

## Human must confirm

SMTP as the first real adapter (when enabled), with a fake adapter for automated tests.

---

# 6. M5-03 — Sender identity

## Proposed

Required configuration when delivery is enabled:

- `NOTIFICATION_FROM_EMAIL` — an address on a **human-approved** domain
- `NOTIFICATION_FROM_NAME` — optional display name

There is **no** repository default such as `noreply@example.com` for production.

M5 must not register DNS, SPF, DKIM, or a production mailbox.

## Human must confirm

The exact from-address / domain (and SMS from-number if SMS is approved).

---

# 7. M5-04 — Recipient, consent, missing contact

## Facts

- Patient `email` and `phone` are optional.
- M3 collected no consent, opt-out, or “transactional notifications allowed” flag.
- Privacy/legal review of using stored email for appointment notices is **not** complete (`docs/TDA-M3-M4-RELEASE-READINESS.md`).

## Proposed engineering behavior (subject to privacy-owner approval)

1. Resolve the appointment’s patient **in the same organization**.
2. If channel is email and `email` is missing or invalid → mark intent `skipped` (terminal). Do not retry.
3. Do **not** invent a consent table in M5 unless the human requires it.
4. Do **not** send to practitioner or staff unless the human adds those recipients.
5. Inactive patient: still deliver historical appointment notices if contact is valid (**or** skip — human must choose). Proposed: **skip if patient is inactive**.

## Alternatives

A. Presence of email implies transactional appointment notices may be sent (proposed, pending privacy owner).  
B. Send nothing until a consent/opt-out model exists (M5 would only build worker + skip-all-until-consent).  
C. Add consent fields in M5 (larger Patient-domain change; requires explicit approval).

## Human must confirm

Recipient (patient email only vs others), missing-contact behavior, inactive-patient behavior, and whether consent/opt-out is required before any send.

---

# 8. M5-05 — Message content

## Proposed body/metadata (email)

May include:

- organization name
- event (created / rescheduled / cancelled)
- appointment start/end rendered in the appointment’s IANA timezone
- opaque appointment id (optional)

Must **not** include:

- diagnosis, treatment, chart, billing, prescription
- date of birth, phone, government ids
- full patient record
- magic login links / portal URLs (no patient portal)

Given name in the greeting is **PII**. Proposed: include first name only if the human accepts that.

## Human must confirm

Whether first name is allowed in the template, and the exact copy/locale (English-only proposed for M5).

---

# 9. M5-06 — Events to deliver

## Proposed

Only intents already written by M4:

- `appointment.created`
- `appointment.rescheduled`
- `appointment.cancelled`

No reminders, no confirm/check-in, no marketing, no bulk campaigns.

---

# 10. M5-07 — Retry policy

## Proposed

| Item           | Proposal                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Max attempts   | 5 including the first try                                                                                               |
| Backoff        | 1, 5, 25, 125 minutes (exponential ×5), then terminal                                                                   |
| Retryable      | network timeout, connection refused, SMTP 4xx greylist if classified retryable, HTTP 429, HTTP 5xx                      |
| Permanent      | invalid recipient, SMTP 5xx-as-permanent where the adapter classifies it so, HTTP 4xx except 429, missing patient/email |
| After terminal | status `failed` or `skipped`; **appointment row unchanged**                                                             |

## Human must confirm

Attempt count and backoff.

---

# 11. M5-08 — Idempotency and deduplication

## Proposed

- One outbox row per appointment mutation (already created in M4).
- Delivery key = outbox `id` (cuid).
- Claim: `pending` → `processing` in one database update with `FOR UPDATE SKIP LOCKED` (or equivalent) so two workers cannot claim the same row.
- After successful provider accept: `processed` and store `providerMessageId` if any.
- Crash while `processing`: if lock/lease expired, another worker may retry **the same outbox id**; the adapter/provider should treat duplicate submits as the same logical send. M5 would add `lockedUntil` / `attemptCount` via an **additive** migration if approved.
- Do not create a second outbox row for retries.

---

# 12. M5-09 — Worker execution model

## Proposed

Use the existing Node worker (`apps/worker`):

- poll outbox for claimable rows
- no Redis, Kafka, SQS, or extra broker (consistent with TDA-ADR-001)
- `NOTIFICATION_PROCESSING_ENABLED` default **false** in local, test, CI, preview, and production until separately configured and approved
- poll interval proposed: 5 seconds (config)

Appointment HTTP requests must not wait on or call the provider.

---

# 13. M5-10 — Observability

## Proposed

Record on the outbox row (or a child `notification_delivery_attempts` table if the human prefers append-only attempts):

- `attemptCount`, `lastAttemptAt`, `lockedUntil`
- `lastErrorCode` (stable class, e.g. `timeout`, `invalid_recipient`) — not SMTP dialogue, not message body
- `providerMessageId` on success

`security_events`: `notification.deliver` / `notification.skip` with `organizationId`, outbox id, outcome. **No** email, phone, or body.

Metrics/alerts (names only until ops exists): claimed, sent, skipped, failed, retry. Production alerting is **not** implemented in M5 code.

Logs: event name, outbox id, organization id, attempt, error **code**. Never secrets, never full message bodies.

---

# 14. M5-11 — Retention and privacy

## Proposed

- Do **not** store the rendered message body in PostgreSQL.
- Do **not** store raw provider response bodies.
- Outbox metadata remains `ON DELETE RESTRICT` with the appointment (M4).
- Legal retention period for delivery metadata is **undefined** (same gap as M4-16). M5 must not invent a purge job.

## Human must confirm

Whether provider message ids may be stored, and any retention period.

---

# 15. M5-12 — Development and test provider

## Proposed

- Automated tests use `FakeNotificationAdapter` only (in-memory; records sends; never opens a network socket to SMTP/Twilio).
- `NOTIFICATION_PROVIDER=unset` (default) → worker does not send.
- `NOTIFICATION_PROVIDER=fake` → tests / local dry-run.
- `NOTIFICATION_PROVIDER=smtp` → real adapter, only when host/credentials/from-address are present **and** processing is enabled.

No real patient (or synthetic production) notifications from CI or unit tests.

---

# 16. Explicitly out of scope for M5

```text
Calendar integration
Patient portal / self-booking
WhatsApp (unless M5-01 is changed)
Practitioner availability
Clinical records
Billing / payments / marketing / bulk campaigns
M1–M4 redesign
Production Cognito/DNS/deploy
Enabling real send by default
```

Delivery does **not** grant PATIENT or SYSTEM_ADMIN appointment API access.

---

# 17. Implementation freeze

Until §19 is `APPROVED`:

- do not claim outbox rows
- do not call SMTP/Twilio
- do not set `processingEnabled` true
- do not add delivery routes

---

# 18. What the human must confirm

1. Channel (M5-01)
2. SMTP vs other provider (M5-02)
3. From-address / domain (M5-03)
4. Recipient + consent/opt-out + missing contact + inactive patient (M5-04)
5. Template fields, including first name (M5-05)
6. Event list (M5-06) — proposed: the three M4 types only
7. Retry count and backoff (M5-07)
8. Claim/idempotency approach (M5-08)
9. Worker polling vs another job runner (M5-09)
10. Audit fields vs separate attempt table (M5-10)
11. Metadata retention (M5-11)
12. Fake/unset defaults (M5-12)

---

# 19. HUMAN APPROVAL

## Approval Status

```text
PROPOSED — AWAITING HUMAN APPROVAL
```

After review, the human may change this section to:

```text
APPROVED
```

## Approved By

```text
Name:
Role:
Date:
```

## Human Approval Statement

I have reviewed the M5 Notification Delivery decisions in this document and approve them as the architectural basis for M5 implementation.

I understand that:

- M5 implementation will follow these decisions.
- Future changes require a new or updated decision record.
- M5 must not silently expand into calendar, portal, WhatsApp, marketing, or clinical domains.
- Enabling real delivery in any environment is a separate configuration and approval decision.
- Production release remains a separate decision.

```text
Human Approval:

[ ] APPROVED
[ ] NOT APPROVED
```

---

# 20. Post-approval rule

Once this document is `APPROVED`, it becomes the M5 implementation source of truth.

If implementation reveals a conflict: **STOP** and report it. Do not silently change the architecture.
