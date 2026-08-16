# TDA-C3 Phase 3 — Implementation Report

**Branch:** `cursor/c3-identity-otp-registration-0d79`  
**ADR:** TDA-ADR-004 (APPROVED FOR IMPLEMENTATION 2026-08-15)  
**Design:** `docs/TDA-C3-DOMAIN-SCHEMA-DIFF.md`  
**PR #8:** untouched (M7 head `cursor/m7-practitioner-availability-3efc`)

---

## Architecture

| Decision       | Implementation                                               |
| -------------- | ------------------------------------------------------------ |
| Auth providers | `unset` \| `managed` (Cognito) \| `otp`                      |
| Session        | Opaque `dc_session` / `auth_sessions.tokenHash` — **no JWT** |
| OTP hashing    | HMAC-SHA256(`OTP_PEPPER`, `salt:otp`) + per-challenge salt   |
| SMS            | `SmsDeliveryPort` + fake / fail-closed adapters only         |
| Email OTP      | Reuses `NotificationDeliveryPort`                            |
| Cognito        | Retained; deprecation criteria documented                    |

### AuthenticationPort

- `createAuthenticationPort` selects Cognito or `OtpAuthenticationAdapter`.
- OTP adapter: `startLogin` → app `/login`; `establishSession` after verified OTP; logout revokes session.

---

## Domain

- **User:** +`phone`, `phoneVerified`
- **UserIdentity:** OTP issuer + `subject=User.id`
- **Patient ↔ User:** `patient_user_links` (unique patient; unique org+user)
- **Practitioner:** +`verificationStatus`; staff create → `verified`; self-reg → `pending`
- **Membership:** still explicit; registration creates role from invitation purpose only
- **Invitation / ClinicCode:** org-scoped, purpose-scoped, hashed secrets
- **Address:** shared `addresses` + ownership joins
- **OTP / RegistrationSession / RateLimit:** challenge persistence with attempts/expiry/resend

### Permissions

| Key                            | PRACTICE_ADMIN | STAFF                                     |
| ------------------------------ | -------------- | ----------------------------------------- |
| invitation.patient.create      | Yes            | Yes                                       |
| invitation.practitioner.create | Yes            | No                                        |
| invitation.revoke              | Yes            | Yes (patient purpose enforced in service) |
| clinic_code.manage             | Yes            | No                                        |
| practitioner.verify            | Yes            | No                                        |
| patient.link_user              | Yes            | Yes                                       |

---

## Database

Migration: `20260815220000_c3_otp_identity_registration`  
Additive only; existing practitioners backfilled to `verificationStatus=verified`.

---

## Testing

- Unit/security: OTP expiry/reuse/bruteforce/resend/rate-limit, invitation purpose/expiry/reuse/tenant, self-verify deny, session logout
- Migration safety test
- Config OTP fail-closed in production for fake SMS
- Full suite: **211 passed** (M7 baseline 191 + C3)

---

## Planned HTTP routes (not all wired in this pass)

Follow existing `/api/auth/*` style; do not duplicate login/callback/logout/session:

| Capability             | Suggested path                                                   |
| ---------------------- | ---------------------------------------------------------------- |
| Redeem invitation      | `POST /api/auth/register/invitation`                             |
| Redeem clinic code     | `POST /api/auth/register/clinic-code`                            |
| Request OTP            | `POST /api/auth/otp/request`                                     |
| Verify OTP             | `POST /api/auth/otp/verify`                                      |
| Complete registration  | `POST /api/auth/register/complete`                               |
| Passwordless login OTP | same otp request/verify with LOGIN\_\* purpose                   |
| Practitioner verify    | `PATCH /api/organizations/:orgId/practitioners/:id/verification` |

---

## IMPLEMENTED

- Domain models + permissions
- Prisma schema + additive migration
- OTP challenge service + crypto
- Invitation / clinic-code / registration session services
- Registration completion service (domain orchestration)
- OtpAuthenticationAdapter + Cognito coexistence
- Practitioner `verificationStatus` + self-verify denial
- SmsDeliveryPort fake/fail-closed
- Config `AUTH_PROVIDER=otp` + OTP\_\* env
- Security + migration tests; M7 regression green

## NOT YET IMPLEMENTED

- Next.js public registration/login UI polish
- Full HTTP route wiring for register/otp in `apps/web`
- Prisma persistence adapters for invite/OTP stores (in-memory used in unit tests)
- Durable rate-limit Prisma store wiring in web runtime
- Practitioner verification HTTP endpoint
- E2E browser flows

## REQUIRES EXTERNAL INFRASTRUCTURE

- Production SMS vendor selection & credentials
- Production email sender for OTP (SMTP already abstracted)
- Cognito user migration / dual-path cutover (separate milestone)
- Production monitoring/alerting for OTP delivery
