# ADR follow-up — C3 Passwordless OTP Identity & Self-Registration

**Status:** APPROVED FOR IMPLEMENTATION (depends on TDA-ADR-004 APPROVED 2026-08-15)  
**Date:** 2026-08-15  
**Depends on:** TDA-ADR-004, TDA-ADR-001, TDA-ADR-002 (partially superseded), TDA-ADR-003 (partially superseded), M1–M7 contracts  
**Branch:** `cursor/c3-identity-otp-registration-0d79`  
**Design:** `docs/TDA-C3-DOMAIN-SCHEMA-DIFF.md`  
**Does not modify:** PR #8 merge policy; M7 practitioner schedule/leave/availability semantics except additive `verificationStatus`

This file records **accepted product decisions** and the **implementation checklist** for C3.

---

## Accepted product decisions (2026-08-15)

| #   | Topic                     | Decision                                                                                           |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Patient org binding       | **P2** — invite / clinic code                                                                      |
| 2   | Practitioner org binding  | **R2** — invite-based join                                                                         |
| 3   | Patient↔User             | **separate + link**                                                                                |
| 4   | Professional verification | **add `verificationStatus`** (`pending` \| `verified` \| `rejected`)                               |
| 5   | OTP IdP                   | **app-owned OTP** superseding Cognito as preferred login path, with coexistence                    |
| 6   | Address                   | **shared entity**                                                                                  |
| 7   | SMS                       | **abstraction + test adapter** in C3; production provider before staging/production OTP activation |

UI label “Dentist” maps to RBAC role **`PRACTITIONER`**.

### Resolved open items (Phase 3.1)

| # | Topic | Resolution |
| --- | --- | --- |
| 1 | Invite permissions | `invitation.patient.create` (PRACTICE_ADMIN + STAFF); `invitation.practitioner.create` (PRACTICE_ADMIN only); `invitation.revoke`; `clinic_code.manage`; `practitioner.verify`; `patient.link_user` |
| 2 | Staff-created `verificationStatus` | **`verified`** — M7 create is PRACTICE_ADMIN `practitioner.manage` provisioning of same-org users |
| 4 | Cognito deprecation criteria | Recorded in `docs/TDA-C3-DOMAIN-SCHEMA-DIFF.md` and ADR-004 §7; removal is a separate milestone |
| 5 | OTP `UserIdentity` subject | `issuer=OTP_ISSUER`, `subject=User.id` (stable opaque application id) |
| 3 | Production SMS vendor | Still deferred |
| 6 | Retention TTL | Config-driven challenge/session expiry; archival purge is a later ops task |

---

## Implementation checklist

### Domain / schema (additive)

- [x] Design documented (`TDA-C3-DOMAIN-SCHEMA-DIFF.md`)
- [x] `verificationStatus` on practitioners
- [x] `addresses` + associations
- [x] `patient_user_links`
- [x] `organization_invitations` + `clinic_codes`
- [x] `auth_otp_challenges` + rate-limit buckets
- [x] User phone + phoneVerified
- [x] `registration_sessions`
- [x] Extend `AuthProviderId` / config for `otp`
- [x] OTP + rate-limit configuration env keys

### AuthenticationPort

- [x] Keep Cognito `managed` adapter
- [x] Add OTP adapter without client JWT
- [x] On success: existing `dc_session` issuance
- [x] Logout invalidates server session

### Registration / delivery / security / frontend / regression

See `docs/TDA-C3-IMPLEMENTATION-REPORT.md` for IMPLEMENTED vs remaining.

---

## Cognito deprecation criteria (must all be true)

1. Existing Cognito users migrated or explicitly handled  
2. OTP authentication reaches production parity  
3. Authentication security review passes  
4. Passwordless registration works  
5. Passwordless login works  
6. Session behavior is equivalent  
7. RBAC is equivalent  
8. Tenant isolation is equivalent  
9. Production OTP delivery is reliable  
10. Rollback strategy exists  
11. Monitoring exists  
12. No required production user depends exclusively on Cognito  

---

## Stop conditions during implementation

Stop and ask if:

- Invite model would allow cross-tenant join without authorization
- Patient↔User link could be claimed by email match without OTP
- `verificationStatus` would silently rewrite M7 `status` semantics
- Production OTP would be enabled without SMS/email providers
- Client JWT session would be introduced alongside `dc_session`

---

## Phase 5 status (2026-08-15)

- Classification: **DEVELOPMENT COMPLETE — EXTERNAL INFRASTRUCTURE PENDING**
- Reports: `docs/TDA-C3-PHASE5-RELEASE-REPORT.md`, `docs/TDA-C3-PHASE5-ENV-AUDIT.md`, `docs/TDA-C3-PHASE5-SECURITY-AUDIT.md`
- In-process OTP E2E + security matrix: implemented
- Staging DB / production SMS / Cognito cutover: **not claimed**
