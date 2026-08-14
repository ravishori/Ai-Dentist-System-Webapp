# TDA-M1 Authentication Contract

Version: 1.0  
Date: 14 August 2026  
Status: Implemented in code; production Cognito configuration is human-owned

## AuthenticationPort

Location: `packages/domain/src/foundation/auth-port.ts`

Application code depends on this port only.

| Method                 | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `isConfigured()`       | Whether a managed IdP is configured                             |
| `startLogin()`         | Begin OIDC authorization-code + PKCE login                      |
| `completeLogin(input)` | Validate callback and establish an application session          |
| `logout(input)`        | Revoke the application session and optional provider logout URL |
| `readSession(input)`   | Return the current `AuthenticatedIdentity` or `null`            |

`providerId` is `"unset"` or `"managed"`. `"managed"` is Amazon Cognito User Pools (Essentials) per TDA-ADR-003.

The port does not expose Cognito SDK types, raw tokens, groups, or AWS exceptions.

## Application identity

Location: `packages/domain/src/foundation/authenticated-identity.ts`

| Field             | Meaning                                               |
| ----------------- | ----------------------------------------------------- |
| `userId`          | Internal application user id                          |
| `issuer`          | OIDC issuer                                           |
| `subject`         | OIDC `sub`                                            |
| `email`           | Snapshot from validated claims (not the identity key) |
| `emailVerified`   | From validated claims                                 |
| `displayName`     | Optional `name` claim                                 |
| `authenticatedAt` | Application session start time (ISO-8601)             |

Stable external identity: **issuer + subject** (TDA-ADR-002). Email is not the immutable key.

## Cognito adapter

Location: `packages/application/src/foundation/auth/cognito-oidc-adapter.ts`

Class: `CognitoOidcAuthenticationAdapter`

Implements standards-based OIDC only (`jose` + `fetch`). No AWS SDK.

Unset adapter: `UnsetAuthenticationPort` (`AUTH_PROVIDER=unset`). Login fails closed with `not_configured`. There is no production mock provider.

## Provider boundary

```
Application HTTP routes
  → AuthenticationPort
    → CognitoOidcAuthenticationAdapter
      → Cognito User Pool (OIDC discovery, authorize, token, JWKS)
```

Cognito owns password policy, email verification, password reset, account recovery, and MFA challenges. The application does not duplicate those systems.

## Session model

After a fully validated callback, the adapter creates an **application session**:

- Cookie name: `dc_session`
- HttpOnly, SameSite=Lax, Path=/, host-only (no Domain)
- Secure in production (`NODE_ENV=production` or `AUTH_COOKIE_SECURE=true`)
- Cookie value is a random token; only SHA-256 hash is stored server-side
- TTL default: 28 800 seconds (8 hours) — implementation detail, not a business policy (TDA-ADR-002 left duration open)
- Login cookie `dc_login` is short-lived (10 minutes) and cleared after callback

Raw ID/access/refresh tokens are not stored in cookies, localStorage, sessionStorage, logs, or the database.

## Error model

`AuthenticationError` maps provider failures to safe client messages:

| Code                          | Client outcome              |
| ----------------------------- | --------------------------- |
| `not_configured`              | 503                         |
| `provider_unavailable`        | 503                         |
| `unauthorized`                | 401                         |
| other authentication failures | 400 generic invalid request |

Responses do not enumerate accounts or include tokens, JWKS, stack traces, or Cognito internals. Server logs may include a sanitized category.

## Configuration

When `AUTH_PROVIDER=managed`, required:

- `OIDC_ISSUER`
- `OIDC_CLIENT_ID`
- `OIDC_REDIRECT_URI`
- `AUTH_SESSION_SECRET` (min 32 characters)

Optional: `OIDC_CLIENT_SECRET` (confidential client, server-side only), `OIDC_POST_LOGOUT_REDIRECT_URI`, `AUTH_SESSION_TTL_SECONDS`, `AUTH_CLOCK_SKEW_SECONDS` (default 60), `AUTH_COOKIE_SECURE`.

Production rejects loopback redirect URIs. No `NEXT_PUBLIC_` secrets. No `SKIP_AUTH` / `DISABLE_AUTH` / `AUTH_PROVIDER=mock`.

## Trust assumptions

- Cognito is the authentication source of truth for credentials and MFA.
- The application is the source of truth for tenant, membership, RBAC, and object-level authorization (not implemented in M1).
- JWKS is taken only from validated discovery for the configured issuer.
- Clock skew tolerance is 60 seconds unless overridden (max 120).
