# C3 Phase 4.1 — Integration Gap Matrix

**Branch:** `cursor/c3-identity-otp-registration-0d79` @ `6c7ffc0`  
**Date:** 2026-08-15  
**PR #8:** untouched

| Capability                     | Domain         | Store (runtime)       | API                | UI               | Tests   | Status                              |
| ------------------------------ | -------------- | --------------------- | ------------------ | ---------------- | ------- | ----------------------------------- |
| OTP request                    | Done           | In-memory only        | Missing            | Missing          | Unit    | **Build Prisma + API + UI**         |
| OTP verify                     | Done           | In-memory only        | Missing            | Missing          | Unit    | **Build Prisma + API + UI**         |
| Patient invitation create      | Done           | In-memory only        | Missing            | Minimal/admin    | Unit    | **Build Prisma + API**              |
| Practitioner invitation create | Done           | In-memory only        | Missing            | Minimal/admin    | Unit    | **Build Prisma + API**              |
| Invitation redeem              | Done           | In-memory only        | Missing            | Missing          | Unit    | **Build Prisma + API + UI**         |
| Clinic code manage/redeem      | Done           | In-memory only        | Missing            | Missing          | Unit    | **Build Prisma + API + UI**         |
| Patient registration           | Done (service) | Ports incomplete      | Missing            | Missing          | Partial | **Build Prisma ports + API + UI**   |
| Practitioner registration      | Done (service) | Ports incomplete      | Missing            | Missing          | Partial | **Build Prisma ports + API + UI**   |
| Passwordless login             | Adapter done   | Session Prisma exists | Missing OTP routes | Missing `/login` | Partial | **Wire otp provider + API + UI**    |
| Logout                         | Done (port)    | PrismaSessionStore    | Exists             | Exists           | Exists  | **Reuse; verify otp path**          |
| Session                        | Done           | PrismaSessionStore    | Exists             | AuthGate         | Exists  | **Reuse; AuthGate for otp**         |
| Practitioner verify            | Service done   | Prisma practitioner   | Missing HTTP       | Missing          | Unit    | **Build API + minimal UI**          |
| Address                        | Domain done    | No Prisma store       | Via registration   | Via registration | Missing | **Build Prisma + registration**     |
| PatientUserLink                | Domain done    | No Prisma store       | Via registration   | —                | Missing | **Build Prisma**                    |
| Rate limits                    | Done           | In-memory only        | —                  | —                | Unit    | **Build Prisma for web**            |
| Cognito coexistence            | Done           | Wired when managed    | Login/callback     | AuthGate         | Exists  | **Preserve; fix otp branch in web** |

## Critical wiring gap

`apps/web/src/infrastructure/auth/port.ts` only enables `managed`; `AUTH_PROVIDER=otp` currently falls through to unset. Phase 4 must call `createAuthenticationPort` for `otp`.

## Product destinations (resolved without STOP)

- Patient post-registration → `/patients` (existing AuthGate destination) or minimal `/portal/patient`
- Practitioner pending → `/portal/practitioner` pending-verification screen
- Login → `/login` (matches `OtpAuthenticationAdapter.startLogin` redirect)

No ADR contradiction found. Proceed with Phase 4 implementation.
