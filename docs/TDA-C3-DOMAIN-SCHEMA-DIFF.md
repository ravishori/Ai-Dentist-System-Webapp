# C3 Phase 3.1 — Domain / Schema Diff (ADR-004)

**Status:** Implementation design (approved ADR-004)  
**Date:** 2026-08-15  
**Branch:** `cursor/c3-identity-otp-registration-0d79`  
**Does not modify:** PR #8 / M7 schedule–leave–availability semantics except additive `verificationStatus`

---

## Decisions locked for schema

| Topic                        | Decision                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------- |
| Patient org binding          | P2 — invitation or org-scoped clinic code                                         |
| Practitioner org binding     | R2 — invitation only                                                              |
| Patient ↔ User              | Explicit `patient_user_links` (no collapse)                                       |
| Practitioner ↔ User         | Preserve `practitioners.userId`                                                   |
| Operational status           | Unchanged: `active` \| `inactive`                                                 |
| Professional verification    | Additive `verificationStatus`: `pending` \| `verified` \| `rejected`              |
| Staff-created practitioner   | `verificationStatus=verified` (PRACTICE_ADMIN `practitioner.manage` provisioning) |
| Self-registered practitioner | `verificationStatus=pending`                                                      |
| Roles                        | No `DENTIST` / `ADMIN` RBAC keys; UI “Dentist” → `PRACTITIONER`                   |
| Session                      | Existing `dc_session` / `auth_sessions.tokenHash`; no client JWT                  |
| Cognito                      | Retained as `AUTH_PROVIDER=managed`; OTP is `AUTH_PROVIDER=otp`                   |

### Staff-created verification rationale

M7 create requires `practitioner.manage` (seeded only to `PRACTICE_ADMIN`), links an existing same-org membership user, and is staff professional provisioning—not self-registration. Therefore staff-created rows initialize **`verified`**. Existing M7 rows are backfilled to **`verified`**. Self-registration initializes **`pending`**. OTP contact proof never sets professional verification.

---

## Additive tables / columns

### `users`

| Change                                      | Notes                                    |
| ------------------------------------------- | ---------------------------------------- |
| `phone` `String?` `@unique`                 | Normalized E.164; multiple NULLs allowed |
| `phoneVerified` `Boolean` `@default(false)` | Parallel to `emailVerified`              |

### `practitioners`

| Change                                              | Notes                          |
| --------------------------------------------------- | ------------------------------ |
| `verificationStatus` `String` `@default("pending")` | Backfill existing → `verified` |

### `addresses`

Shared address entity: `line1`, `line2?`, `city`, `state?`, `postalCode`, `country`, `type` (`HOME`\|`WORK`\|`BILLING`\|`OTHER`).

### `patient_addresses` / `practitioner_addresses`

Association tables with `isPrimary`. Ownership stays on Patient/Practitioner—no duplicated address columns on User.

### `patient_user_links`

| Constraint                           | Purpose                              |
| ------------------------------------ | ------------------------------------ |
| `@@unique([patientId])`              | One portal user per patient          |
| `@@unique([organizationId, userId])` | One patient link per user per tenant |
| `organizationId` FK                  | Tenant isolation                     |
| `linkedByUserId?`                    | Audit                                |

No silent email/phone match linking.

### `organization_invitations`

Org-scoped, purpose-scoped (`PATIENT` \| `PRACTITIONER`), hashed token (`tokenHash` unique), expiry, single-use (`maxUses=1`), revocable (`REVOKED`), redeem audit fields. Raw token never stored or logged.

### `clinic_codes`

Org-scoped, reusable for **PATIENT** purpose only, `codeHash` unique per org, revocable/expirable. Redemption still requires OTP; never a global cross-tenant code.

### `registration_sessions`

Holds invite-resolved `organizationId` (server-set), purpose, contact draft, dual-OTP verification timestamps, address draft JSON, expiry. Client cannot supply org id for join.

### `auth_otp_challenges`

Destination type/normalized destination, purpose, `codeSalt` + `codeHash` (no plaintext OTP), attempts/maxAttempts, expiry, consumedAt, resend metadata, optional registration/session/org/invite/user context, `ipHash?`.

### `auth_rate_limit_buckets`

Durable counters keyed by hashed bucket (destination / IP / invite / registration).

---

## Permission keys (existing naming convention)

| Key                              | PRACTICE_ADMIN | STAFF | Others |
| -------------------------------- | -------------- | ----- | ------ |
| `invitation.patient.create`      | Yes            | Yes   | No     |
| `invitation.practitioner.create` | Yes            | No    | No     |
| `invitation.revoke`              | Yes            | Yes\* | No     |
| `clinic_code.manage`             | Yes            | No    | No     |
| `practitioner.verify`            | Yes            | No    | No     |
| `patient.link_user`              | Yes            | Yes   | No     |

\*STAFF may revoke **patient** invitations only (enforced in application, not catalog).

`SYSTEM_ADMIN`, `PATIENT`, `PRACTITIONER` do not receive invite minting permissions.

---

## OTP crypto (selected)

- **Generation:** `crypto.randomInt` → fixed-length numeric OTP (default 6 digits ≈ 20 bits; compensated by short TTL, attempt caps, rate limits, pepper).
- **Storage:** per-challenge random salt + **HMAC-SHA256(`OTP_PEPPER`, `salt || otp`)** hex digest (keyed; not bare SHA-256 of the OTP).
- **Compare:** constant-time equality on digests.
- **Never** log or return plaintext OTP/invitation secrets after issue/redeem.

---

## Cognito deprecation criteria (record only; not executed in C3)

Cognito (`managed`) must not be removed until all are true:

1. Existing Cognito users migrated or explicitly handled
2. OTP authentication at production parity
3. Authentication security review passed
4. Passwordless registration works
5. Passwordless login works
6. Session behavior equivalent
7. RBAC equivalent
8. Tenant isolation equivalent
9. Production OTP delivery reliable
10. Rollback strategy exists
11. Monitoring exists
12. No required production user depends exclusively on Cognito

Removal is a separate deliberate change.

---

## Explicit non-goals in this schema pass

- Production SMS vendor
- Client JWT sessions
- Collapsing Patient into User
- Auto branch assignment on practitioner self-reg
- Licensing/document verification vendors
- Silent Cognito↔OTP account merge by email/phone alone
