# C3 Phase 5 — Security audit (focused)

**Date:** 2026-08-15  
**Branch:** `cursor/c3-identity-otp-registration-0d79`  
**Scope:** OTP identity, invitations, registration, sessions, tenant isolation  
**Method:** Code review + Phase 5 in-process E2E / existing security tests  
**Not claimed:** Production SMS delivery review; live staging penetration test

## OTP

| Control | Finding |
| --- | --- |
| Entropy | Numeric OTP length configurable (default 6); low-entropy by design, mitigated by hashing + rate limits |
| Hashing | HMAC-SHA256(pepper, `salt:otp`); salt per challenge; constant-time compare |
| Expiration | TTL enforced; expired challenges marked consumed |
| Attempts | `maxAttempts` invalidates challenge |
| Resend | Cooldown + max resends |
| Rate limiting | Per-IP and per-destination buckets on request/verify |
| Replay | `tryConsume` / consumedAt; concurrent verify allows one success |
| API leakage | HTTP handlers never return plaintext OTP; test-only `capturePlaintext` / adapter inspection |

## Invitations

| Control | Finding |
| --- | --- |
| Randomness | `randomUrlSafe(32)` tokens |
| Hashing | Peppered token hash at rest |
| Expiration | Enforced on redeem (`410`) |
| Single-use | CAS redeem (`updateMany` in Prisma; sync critical section in-memory) |
| Tenant binding | Org taken from invitation/clinic code only |
| Purpose binding | PATIENT vs PRACTITIONER mismatch rejected |
| Mint RBAC | PATIENT/PRACTITIONER cannot mint; PRACTICE_ADMIN required for practitioner invites |

## Registration

| Control | Finding |
| --- | --- |
| Mass assignment | Org/role from registration session, not client body |
| Role escalation | Purpose → PATIENT/PRACTITIONER only |
| Organization spoofing | Clinic-code redeem ignores client `organizationId` |
| Identity duplication | Complete rejects existing email/phone (`409`) |
| Practitioner verify | Self-reg → `pending`; self-verify denied |

## Session

| Control | Finding |
| --- | --- |
| Cookie | `dc_session` HttpOnly, SameSite=lax, Secure when configured |
| Storage | Token hashed (SHA-256) at rest; raw token not in API JSON |
| Logout | Revokes by token hash; reuse fails |
| Fixation | New opaque token issued on establishSession |
| JWT | Not introduced |

## Tenant / IDOR

| Control | Finding |
| --- | --- |
| Cross-tenant membership | Invite/clinic code bind org server-side |
| PatientUserLink | Created with session organizationId |
| Practitioner verify | Org-scoped permission `practitioner.verify` |
| Unauthenticated APIs | Fail closed under `AUTH_PROVIDER=unset` |

## Concurrency

| Scenario | Result in Phase 5 |
| --- | --- |
| Concurrent OTP verify | One success |
| Concurrent invitation redeem | One success (in-memory CAS fixed to match Prisma) |
| Duplicate registration identity | Second `409` |

## Residual risks (not Phase 5 blockers for Development Complete)

1. Production SMS provider unset — required before Staging/Production OTP.
2. Agent environment had no connectable Postgres — Prisma-backed browser E2E not executed here.
3. Registration OTP destination vs session email/phone binding should remain monitored in staging.
4. Cognito migration/cutover intentionally deferred.

## Verdict

**Security review for C3 application controls: PASS for Development Complete.**  
**Not sufficient alone for Staging Ready or Production Ready** without dedicated DB staging + real OTP delivery path.
