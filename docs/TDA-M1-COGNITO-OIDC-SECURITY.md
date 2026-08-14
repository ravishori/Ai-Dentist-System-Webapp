# TDA-M1 Cognito OIDC Security

Version: 1.0  
Date: 14 August 2026

## OIDC discovery

The adapter loads `{issuer}/.well-known/openid-configuration` using server-side `fetch`.

- Configured `OIDC_ISSUER` must match `discovery.issuer` exactly.
- `authorization_endpoint`, `token_endpoint`, and `jwks_uri` are required URLs.
- HTTPS is required except in `NODE_ENV=test`.
- Discovery documents are cached in-process for 5 minutes.
- Browser-supplied discovery or JWKS URLs are ignored.

## JWKS

- `jwks_uri` comes only from validated discovery.
- Production JWKS URLs must be HTTPS.
- `jose.createRemoteJWKSet` caches keys (`cooldownDuration` 30s, `cacheMaxAge` 10 minutes, `timeoutDuration` 5s).
- Unknown `kid` values fail verification.
- JWT headers `jku` and `x5u` are rejected (JWKS poisoning).
- Allowed algorithm: **RS256** only (`none` and HS256 rejected).

## JWT / ID token validation

Verified with `jose.jwtVerify` against the trusted JWKS:

- structure (three segments)
- signature
- algorithm allowlist
- issuer
- audience (`OIDC_CLIENT_ID`)
- expiration (`exp`) with clock skew
- `iat` present
- nonce matches the login transaction
- `sub` present
- `token_use` must be `id` when present (Cognito)

Decoded claims without cryptographic verification are never treated as authenticated.

## Issuer and audience

Issuer is the configured Cognito user-pool issuer, not a client-supplied value. Audience is the confidential/public app client id. Mismatch fails closed.

## State

- 32-byte cryptographically random `state`
- Bound to a signed HttpOnly `dc_login` cookie and a hashed server-side login transaction
- TTL 600 seconds
- Single-use (`consume` marks the transaction)
- Missing, wrong, expired, or replayed state cannot create a session

This is the OIDC login CSRF control.

## Nonce

- 32-byte cryptographically random `nonce`
- Sent on the authorize request and stored hashed with the transaction
- Must match the ID token `nonce` claim
- Missing, wrong, or reused nonce (via consumed transaction) fails closed

## PKCE

- `code_verifier` is 32-byte random
- Challenge: S256 (SHA-256, base64url)
- Verifier lives only in the signed login cookie (not logged, not stored in the database)
- Single-use with the login transaction
- Token request includes `code_verifier`
- Implicit grant is not used

## Callback security

Order:

1. Reject client `redirect_uri` query (open-redirect attempt)
2. Require code + state + login cookie
3. Verify signed login cookie and state match
4. Consume login transaction (replay protection)
5. Exchange code at the discovered token endpoint
6. Validate ID token (signature, iss, aud, exp, nonce, alg, sub)
7. Map issuer+subject to application user
8. Reject disabled users
9. Create a new application session token (session fixation prevention)
10. Clear `dc_login`, set `dc_session`

No session is created if any step fails. State is consumed before token success so retries require a new login.

## Session security

- New random session token on each successful login
- Server stores SHA-256 of the token, not the token itself
- HttpOnly / SameSite=Lax / host-only / Secure in production
- Logout sets `revokedAt` and clears cookies
- Revoked or expired sessions read as unauthenticated

Tokens are never placed in URLs, localStorage, sessionStorage, or logs.

## Logout

- Revokes the hashed application session
- Clears `dc_login` and `dc_session`
- If discovery provides `end_session_endpoint`, redirects there with configured `client_id` and allowlisted `logout_uri`
- Logout redirect is server-configured (`OIDC_POST_LOGOUT_REDIRECT_URI` or `APP_BASE_URL`), never a client-supplied URL

## Secret handling

- `OIDC_CLIENT_SECRET` and `AUTH_SESSION_SECRET` are server-only
- Not `NEXT_PUBLIC_*`
- Logger redacts keys matching secret/token/password/nonce patterns
- Authorization codes, state, nonce, PKCE verifier, and JWTs are not logged

## Key rotation

Remote JWKS caching uses `kid`. A new Cognito signing key is fetched when an unknown `kid` is observed (jose cooldown/cache behaviour). Unknown keys fail until the trusted JWKS presents them.

## Provider outage

Discovery or token-endpoint network/5xx failures map to `provider_unavailable` (HTTP 503). The application fails closed. There is no auth bypass.

## Rate limiting

No application-level auth throttle is implemented in M1. Brute-force and credential stuffing controls are delegated to Cognito. Application endpoints do not add a second password oracle.

## Clock skew

Default `AUTH_CLOCK_SKEW_SECONDS=60` (cap 120). This is an implementation detail, not a business session policy.

## Browser security headers

OIDC callback routes use the same application headers as the rest of the web app:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `X-Frame-Options: DENY`
- CSP: `default-src 'self'` with `script-src`/`style-src` `'self' 'unsafe-inline'` so Next.js App Router inline bootstrapping can run; `object-src 'none'`; `frame-ancestors 'none'`; `form-action 'self'`
- `form-action 'self'` does not apply to top-level navigations to Cognito (authorization and logout redirects)

Nonce-based CSP without `'unsafe-inline'` is deferred to security hardening (M5). Callback routes do not weaken these headers.
