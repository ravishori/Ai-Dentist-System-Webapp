# TDA-C3 Phase 4 — Implementation Report

**Branch:** `cursor/c3-identity-otp-registration-0d79`  
**ADR:** TDA-ADR-004  
**Gap matrix:** `docs/TDA-C3-PHASE4-GAP-MATRIX.md`

## Status

Phase 4 application integration layer implemented: Prisma persistence, HTTP APIs, passwordless UI, AuthGate updates. Production SMS vendor remains external.

## API inventory

| Method | Path                                  | Access               | Role                  | Purpose                                        |
| ------ | ------------------------------------- | -------------------- | --------------------- | ---------------------------------------------- |
| POST   | `/api/auth/otp/request`               | Public               | —                     | Registration OTP request                       |
| POST   | `/api/auth/otp/verify`                | Public               | —                     | Registration OTP verify                        |
| POST   | `/api/auth/login/otp/request`         | Public               | —                     | Passwordless login OTP (enumeration-safe)      |
| POST   | `/api/auth/login/otp/verify`          | Public               | —                     | Passwordless login verify → `dc_session`       |
| POST   | `/api/auth/register/invitation`       | Public               | —                     | Redeem invitation → registration session       |
| POST   | `/api/auth/register/clinic-code`      | Public               | —                     | Redeem clinic code (org from code, not client) |
| POST   | `/api/auth/register/profile`          | Public\*             | —                     | Update registration session profile            |
| POST   | `/api/auth/register/complete`         | Public\*             | —                     | Complete registration + session                |
| POST   | `/api/invitations`                    | Privileged           | invite permissions    | Mint invitation                                |
| POST   | `/api/clinic-codes`                   | Privileged           | `clinic_code.manage`  | Create clinic code                             |
| PATCH  | `/api/practitioners/:id/verification` | Privileged           | `practitioner.verify` | Set verificationStatus                         |
| GET    | `/api/auth/login`                     | Public               | —                     | Provider start (otp → `/login`)                |
| GET    | `/api/auth/session`                   | Public probe         | —                     | Existing session                               |
| POST   | `/api/auth/logout`                    | Authenticated cookie | —                     | Existing logout                                |

\*Requires valid registration session id (not privileged RBAC).

## Persistence

- `PrismaOtpChallengeStore` (+ atomic `tryConsume`)
- `PrismaRateLimitBucketStore`
- `PrismaInvitationStore` (+ atomic `tryRedeemInvitation`)
- `PrismaRegistrationSessionStore`
- `PrismaRegistrationSupport` (user/membership/patient/link/address)

## UI

- `/login` passwordless
- `/register/patient`, `/register/dentist`
- `/portal/patient`, `/portal/practitioner` (pending verification copy)
- AuthGate / header / landing updated for OTP + registration entry

## External dependencies (unchanged)

- Production SMS vendor
- Cognito migration/cutover
- Production OTP monitoring
