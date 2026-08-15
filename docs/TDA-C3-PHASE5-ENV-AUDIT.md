# C3 Phase 5.1 — Environment audit (no secret values)

**Date:** 2026-08-15  
**Branch:** `cursor/c3-identity-otp-registration-0d79` @ `49aaea9`  
**Agent environment:** no linked Cursor environment; no Docker; `DATABASE_URL` set but **not connectable**

| Variable | Configured in this run | Required for | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | yes (runtime default) | all | |
| `LOG_LEVEL` | optional | ops | |
| `DATABASE_URL` | yes (set) | Prisma / staging E2E | Connect attempt **failed** here |
| `AUTH_PROVIDER` | unset (default / Playwright) | auth | Playwright smoke forces `unset` |
| `APP_BASE_URL` | default | redirects | |
| `AUTH_SESSION_SECRET` | unconfigured | `otp` / `managed` | required when provider ≠ unset |
| `OTP_ISSUER` | unconfigured | `otp` | |
| `OTP_PEPPER` | unconfigured | `otp` | |
| `OTP_LENGTH` … `OTP_VERIFY_RATE_LIMIT_MAX` | defaults in schema | `otp` | optional overrides |
| `INVITATION_TTL_SECONDS` | default | invites | |
| `REGISTRATION_SESSION_TTL_SECONDS` | default | registration | |
| `SMS_PROVIDER` | unset | SMS OTP | fake only in non-prod |
| `OTP_ALLOW_FAKE_SMS` | false | test only | blocked in production |
| `OIDC_*` | unconfigured | `managed` | Cognito coexistence |
| `NOTIFICATION_*` / `SMTP_*` | unset / optional | email OTP delivery | fail-closed by default |
| `PLAYWRIGHT_BASE_URL` | optional | E2E | |

## Implication

Full browser OTP E2E against Prisma **cannot** be executed in this agent pod without a dedicated test database. Phase 5 therefore validates C3 integration via **in-process application E2E** (Vitest) using fake SMS/email adapters with `capturePlaintext` **only inside tests**, plus Playwright UI smoke under `AUTH_PROVIDER=unset`.
