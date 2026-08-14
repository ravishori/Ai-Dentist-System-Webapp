# TDA M1 Cognito OIDC Authentication Implementation Report

## Status

M1 authentication foundation is implemented in code on `cursor/m0-repository-baseline-3efc`.

- Cognito User Pools (Essentials) is isolated behind `AuthenticationPort`.
- Authorization, RBAC, tenant authorization, and business workflows are **not** implemented.
- Production Cognito pools, credentials, DNS, and deployment were **not** created.
- Passing tests does **not** equal production readiness.

**M1 complete; M2 not started.**

## Approved ADRs

Treated as source of truth (not rewritten):

| ADR         | Title                                                  | Implementation use                                                                             |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| TDA-ADR-001 | Technology Stack & Architecture Reconciliation         | Next.js / TypeScript modular monolith; Prisma/PostgreSQL                                       |
| TDA-ADR-002 | Identity, Authentication, Authorization & Tenant Model | IdP authenticates; app owns identity mapping and sessions; issuer+subject key; no email-as-key |
| TDA-ADR-003 | Managed Identity Provider Selection                    | Amazon Cognito User Pools (Essentials), IdP-only, replaceable behind the port                  |

ADR markdown under `docs/adr/` was not edited. Prettier is ignored for that directory so table wrapping cannot look like an architectural change.

Scope tension with TDA-ADR-002 §20 (full Foundation org/RBAC/audit tables in M1) is recorded in `docs/ADR-FOLLOWUP-M1.md`. Remaining Foundation tables are deferred, not cancelled. No silent ADR amendment.

## Files Changed

Representative paths (full lists are in the git commits):

- Domain port/identity: `packages/domain/src/foundation/auth-port.ts`, `authenticated-identity.ts`, `authentication-error.ts`
- Adapter: `packages/application/src/foundation/auth/`
- Config: `packages/config/src/index.ts`, `.env.example`
- Persistence: `packages/db/prisma/schema.prisma`, `packages/db/src/auth-stores.ts`, migration `20260814120000_m1_authentication_identity`
- HTTP: `apps/web/src/app/api/auth/{login,callback,logout,session}/route.ts`
- Wiring: `apps/web/src/infrastructure/auth/`
- Tests: `packages/application/src/foundation/auth/oidc.security.test.ts`
- Docs: `docs/TDA-M1-AUTHENTICATION-CONTRACT.md`, `docs/TDA-M1-COGNITO-OIDC-SECURITY.md`, this report, `docs/ADR-FOLLOWUP-M1.md`

## AuthenticationPort

Location: `packages/domain/src/foundation/auth-port.ts`

M0 established `providerId` (`"unset"` \| `"managed"`). M1 added application-neutral operations:

- `isConfigured()`
- `startLogin()`
- `completeLogin(input)`
- `logout(input)`
- `readSession(input)`

The port does not expose Cognito SDK types, raw tokens, groups, or AWS exceptions.

## Cognito Adapter

Location: `packages/application/src/foundation/auth/cognito-oidc-adapter.ts`

Class: `CognitoOidcAuthenticationAdapter`

Standards-based OIDC (`jose` + `fetch`). No AWS SDK.

Factory: `createAuthenticationPort()` in `create-authentication.ts`. When `AUTH_PROVIDER=unset`, `UnsetAuthenticationPort` fails closed (`not_configured`). There is no production mock provider and no `SKIP_AUTH` / `DISABLE_AUTH` / `AUTH_PROVIDER=mock`.

HTTP mapping lives in `http.ts`. Next.js routes depend on the port/helpers, not Cognito.

## OIDC Discovery

Location: `packages/application/src/foundation/auth/oidc-discovery.ts`

- Server-side fetch of `{issuer}/.well-known/openid-configuration`
- Configured issuer must match `discovery.issuer`
- Requires `authorization_endpoint`, `token_endpoint`, `jwks_uri`
- Optional `userinfo_endpoint`, `end_session_endpoint`
- HTTPS required except `NODE_ENV=test`
- In-process cache (5 minutes)
- Browser-supplied discovery/JWKS URLs are ignored

## JWKS

Location: `packages/application/src/foundation/auth/id-token.ts` (`createRemoteJwks`)

- `jwks_uri` only from validated discovery
- `jose.createRemoteJWKSet` with cooldown 30s, cache 10 minutes, timeout 5s
- Unknown `kid` fails verification
- JWT `jku` / `x5u` rejected (JWKS poisoning)
- Algorithm allowlist: **RS256** only

## Token Validation

`verifyIdToken()` uses `jose.jwtVerify` (not decode-only):

- JWT structure
- signature
- algorithm allowlist (`none` and HS256 rejected)
- issuer
- audience (`OIDC_CLIENT_ID`)
- expiration with clock skew
- `iat` present
- nonce match
- `sub` present
- `token_use` must be `id` when present

## PKCE

S256 only.

- 32-byte random verifier
- SHA-256 base64url challenge on the authorize request
- Verifier bound to the signed HttpOnly `dc_login` cookie (not written to the database, not logged)
- Single-use with the login transaction
- Token request sends `code_verifier`
- Implicit grant is not implemented

## State

- 32-byte cryptographically random `state`
- Bound to signed `dc_login` cookie and SHA-256 hashed server-side login transaction
- TTL 600 seconds
- Single-use consume
- Missing / wrong / expired / replayed state cannot create a session (OIDC login CSRF control)

## Nonce

- 32-byte cryptographically random `nonce`
- Stored hashed with the login transaction
- Must match the ID token `nonce` claim
- Missing / wrong / reused nonce fails closed

## Claim Mapping

Validated claims map into `AuthenticatedIdentity`:

- `iss` / `sub` (identity key)
- `email`, `email_verified`, `name` (snapshot only)
- `authenticatedAt` from application session start

Raw token payloads are not exposed to application code.

## Identity Mapping

TDA-ADR-002 requires provider subject → application user and session metadata.

- First login: create `users` + `user_identities` (`issuer` + `subject` unique)
- Existing identity: reuse `userId`; email snapshot may change; identity key does not
- Same email + different `sub`: two users (no auto-merge; OPEN)
- Disabled `users.status`: `account_disabled` (client message is non-enumerating)

No Organization / Membership / Role / Permission tables (see ADR follow-up).

## Sessions

Application-managed sessions after full callback validation:

- Cookie `dc_session`: HttpOnly, SameSite=Lax, Path=/, host-only, Secure in production
- Cookie value is a random token; SHA-256 stored in `auth_sessions`
- Default TTL 28 800 seconds (8 hours) — implementation default, not a business policy
- New session token on each login (session fixation prevention)
- Login cookie cleared after callback
- Tokens are not stored in localStorage, sessionStorage, URLs, logs, or the database

## Logout

- Revokes `auth_sessions.revokedAt`
- Clears `dc_login` and `dc_session`
- Optional Cognito `end_session_endpoint` with server-configured `logout_uri` (`OIDC_POST_LOGOUT_REDIRECT_URI` or `APP_BASE_URL`)
- Client-supplied redirect URLs are rejected

Routes: `GET|POST /api/auth/logout`

## Configuration

When `AUTH_PROVIDER=managed`:

Required: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_REDIRECT_URI`, `AUTH_SESSION_SECRET` (≥32 chars)

Optional: `OIDC_CLIENT_SECRET` (server-side only), `OIDC_POST_LOGOUT_REDIRECT_URI`, `AUTH_SESSION_TTL_SECONDS`, `AUTH_CLOCK_SKEW_SECONDS` (default 60, max 120), `AUTH_COOKIE_SECURE`

Guards:

- Production rejects loopback redirect/logout URIs
- No `NEXT_PUBLIC_` secrets
- Local/CI default remains `AUTH_PROVIDER=unset` (fail closed for login)
- Missing managed settings fail config load (fail closed)
- `.env.example` contains placeholders only

## Security Tests

`packages/application/src/foundation/auth/oidc.security.test.ts` (33 cases) plus config tests.

Covered: successful login; first and existing identity mapping; logout; missing/invalid/replayed/expired state; missing/invalid/replayed nonce; invalid and replayed authorization code; invalid ID token / signature / issuer / audience / expiration / algorithm (`none`, HS256); unknown JWKS key; malformed JWKS; provider outage; malformed discovery; missing configuration; client `redirect_uri` / open redirect; session fixation; session reuse after logout; JWKS `jku` poisoning; disabled user; token leakage in HTTP responses.

## Dependency Changes

Added **`jose@6.1.3`** to `@dentalcare/application`.

No AWS SDK. Standard OIDC/JWT is sufficient for Cognito User Pool ID-token verification.

`packages/db` now depends on `@dentalcare/application` for store interfaces (Prisma adapters).

## Database Changes

Additive migration only: `packages/db/prisma/migrations/20260814120000_m1_authentication_identity/migration.sql`

Tables:

- `users`
- `user_identities` (unique `issuer` + `subject`)
- `auth_sessions`
- `auth_login_transactions`

No historical migrations were rewritten. No Organization / Branch / Membership / Role / Permission / Patient / Appointment / Notification tables.

Prisma schema validated (`pnpm db:validate`). Applying the migration against a live database is a human-controlled operation.

## Known Limitations

- No production Cognito User Pool or credentials
- Session idle vs absolute timeout not specified by ADR (8h absolute default)
- No application-level auth rate limiting (delegated to Cognito)
- CSP allows `'unsafe-inline'` scripts/styles so Next.js App Router can bootstrap; nonce-based CSP is M5
- Login transactions and sessions persist hashed values; PKCE verifier is in the signed cookie only
- Refresh tokens are not persisted (authorization-code exchange uses the ID token; refresh is out of M1 session design)
- Remaining ADR-002 Foundation tables are not present
- No global auth middleware (public `/` remains public; session probe is `/api/auth/session`)

## Open Decisions

Do not invent business rules. Recorded OPEN:

- MFA factor policy (ADR-SEC-002 / TDA-ADR-002)
- Session idle vs absolute duration
- Duplicate-email merge (same email, different `sub`)
- Account deletion / retention
- Production region, pool, redirect URIs, and domains (human-owned)
- Whether remaining Foundation org/RBAC/audit tables must land before any authenticated UI beyond session probe (`docs/ADR-FOLLOWUP-M1.md`)

## Production Readiness

**Not production ready.**

M1 did not configure a production Cognito User Pool, create production credentials, deploy, change DNS, or activate production authentication.

Human operations remaining: provision the User Pool, register exact redirect URIs per environment, set secrets in the hosting environment, run the additive migration, and review CSP/session policy before go-live.

## Git Status

Branch: `cursor/m0-repository-baseline-3efc` (not `main`; no force-push, merge, or deploy)

| Commit                                     | Message                                             |
| ------------------------------------------ | --------------------------------------------------- |
| `6bf087bac4dbc9b1a4c0992ede78df9bac40f183` | `feat(auth): add cognito oidc adapter`              |
| `13a62010cf6682d9747f91c9cbd4b1fea73ac6a7` | `test(auth): add oidc security coverage`            |
| (this documentation commit)                | `docs(auth): document m1 authentication foundation` |

Parent of M1 work: `7d6d1e3` (`docs(adr): propose TDA-ADR-001/002/003 architecture decisions`).

## Validation results

Repository scripts are **pnpm** (not npm). Equivalent gates:

| Gate       | Command                                     | Result                                                                  |
| ---------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| Unit tests | `pnpm test`                                 | Pass — 42 tests (4 files), including 33 OIDC security tests             |
| Lint       | `pnpm lint`                                 | Pass                                                                    |
| Format     | `pnpm format:check`                         | Pass (`docs/adr/` ignored to protect approved ADR text)                 |
| Typecheck  | `pnpm typecheck`                            | Pass                                                                    |
| Schema     | `pnpm db:validate`                          | Pass                                                                    |
| Build      | `pnpm build`                                | Pass — web routes include `/api/auth/{login,callback,logout,session}`   |
| Prod audit | `pnpm security:audit` (`pnpm audit --prod`) | Pass — no known vulnerabilities                                         |
| npm audit  | `npm audit --omit=dev`                      | Not applicable — this repo has `pnpm-lock.yaml`, no `package-lock.json` |
| Secrets    | `pnpm security:secrets`                     | Pass                                                                    |
| E2E        | `CI=true pnpm test:e2e`                     | Pass — 2 Playwright tests                                               |

## PR status

Draft PR on this branch to be updated after push. Production merge to `main` is out of scope.
