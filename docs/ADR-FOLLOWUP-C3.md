# ADR follow-up — C3 Passwordless OTP Identity & Self-Registration

**Status:** PROPOSED (human approval required; depends on TDA-ADR-004)  
**Date:** 2026-08-15  
**Depends on:** TDA-ADR-004, TDA-ADR-001, TDA-ADR-002 (partially superseded), TDA-ADR-003 (partially superseded), M1–M7 contracts  
**Branch:** `cursor/c3-identity-otp-registration-0d79`  
**Does not modify:** PR #8 merge policy; M7 practitioner schedule/leave/availability semantics except additive `verificationStatus`

This file records **accepted product decisions** and the **implementation checklist** for C3. It is not self-approved.

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

---

## Implementation checklist (post-ADR approval)

### Domain / schema (additive)

- [ ] `verificationStatus` on practitioners (default `pending` for self-reg; staff-created may be `verified` by policy)
- [ ] `addresses` shared table + associations for Patient / Practitioner
- [ ] `patient_user_links` (or equivalent) with uniqueness protections
- [ ] `organization_invites` (patient clinic code / practitioner invite) with expiry, role, org, issuer, consumption
- [ ] `auth_otp_challenges` (purpose, destination hash/normalized destination, otp hash, attempts, expiry, consumedAt)
- [ ] User phone + phoneVerifiedAt (or normalized identity channels table) without collapsing domain profiles
- [ ] Extend `AuthProviderId` / config for `otp`
- [ ] OTP + rate-limit configuration env keys (no secrets in git)

### AuthenticationPort

- [ ] Keep Cognito `managed` adapter
- [ ] Add OTP adapter methods without client JWT
- [ ] On success: existing `dc_session` issuance path
- [ ] Logout invalidates server session

### Registration APIs (names illustrative; follow repo conventions)

- [ ] Accept invite / resolve clinic
- [ ] Start patient registration
- [ ] Start practitioner registration
- [ ] Request/verify email OTP
- [ ] Request/verify phone OTP
- [ ] Complete registration → session
- [ ] Passwordless login via OTP
- [ ] Safe enumeration-resistant errors

### Delivery

- [ ] Email OTP via email delivery abstraction (not appointment outbox event types)
- [ ] `SmsDeliveryPort` + test/fake adapter only in C3
- [ ] Fail closed if production OTP enabled without providers

### Security

- [ ] Hash OTPs; constant-time verify; attempt/resend/rate limits
- [ ] No OTP in responses/logs
- [ ] Invite required for tenant join
- [ ] No self-assignment of STAFF / PRACTICE_ADMIN / SYSTEM_ADMIN
- [ ] Concurrent registration race tests
- [ ] Session fixation / CSRF review per existing web patterns

### Frontend

- [ ] Patient invite registration + dual OTP screens
- [ ] Practitioner invite registration + pending verification workspace
- [ ] Passwordless login
- [ ] Accessibility: keyboard, paste OTP, screen readers

### Regression

- [ ] M3 patient staff APIs green
- [ ] M7 practitioner schedule/leave/availability green
- [ ] Unauthenticated Cognito/unset paths still coherent when `AUTH_PROVIDER≠otp`
- [ ] PR #8 not retargeted/merged by this workstream

---

## Explicit open items (do not invent)

1. Exact invite permission key and who may mint patient vs practitioner invites.
2. Whether staff-created practitioners default to `verificationStatus=verified`.
3. Production SMS vendor (Twilio / SNS / other) — **after** C3 abstractions.
4. Cognito deprecation milestone criteria.
5. OTP subject scheme for `UserIdentity` under OTP issuer.
6. Retention TTL for OTP rows and abandoned registration state.

---

## Stop conditions during implementation

Stop and ask if:

- Invite model would allow cross-tenant join without authorization
- Patient↔User link could be claimed by email match without OTP
- `verificationStatus` would silently rewrite M7 `status` semantics
- Production OTP would be enabled without SMS/email providers
- Client JWT session would be introduced alongside `dc_session`
