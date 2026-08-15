# Staging hosting & deployment guide

**Status distinctions (do not collapse these):**

```text
PROPOSED                  — ADR-IMP-005 awaiting human approval
IMPLEMENTED IN REPOSITORY — Dockerfiles + render.yaml + docs in git
DEPLOYED                  — NOT claimed; staging deploy not performed by agents
PRODUCTION APPROVED       — NOT claimed
```

Related: `docs/adr/ADR-IMP-005-staging-hosting-render.md` (PROPOSED)

---

## 1. Architecture

```text
Cloudflare DNS (future)
      │
      │  NOT configured yet — dental.trinetralab.net remains unconfigured
      ▼
Render Web service (Docker)
apps/web → next start --hostname 0.0.0.0 --port $PORT
      │
      ├──────────────► Render Managed PostgreSQL 16
      │                 btree_gist via existing Prisma migrations
      │                 M4/M7 GiST exclusions preserved
      │
      ▼
Render Worker service (Docker)
apps/worker → long-running poller (SMTP fail-closed by default)
```

Health check: `GET /api/health` → `{ status: "ok", service: "web", milestone: "M7", ... }`  
Does not expose secrets, Cognito details, or connection strings.

---

## 2. Repository files

| File                                             | Purpose                                                     |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `Dockerfile.web`                                 | Multi-stage Node 22 + pnpm web image                        |
| `Dockerfile.worker`                              | Multi-stage Node 22 + pnpm worker image                     |
| `.dockerignore`                                  | Keeps secrets and local artifacts out of the build context  |
| `render.yaml`                                    | Render Blueprint for **staging** services (auto-deploy off) |
| `docs/adr/ADR-IMP-005-staging-hosting-render.md` | PROPOSED hosting decision                                   |

---

## 3. Web service

```text
Build:  pnpm build:packages && pnpm --filter @dentalcare/web build
Start:  next start --hostname 0.0.0.0 --port $PORT
Node:   22
Port:   $PORT (default 3000)
```

---

## 4. Worker service

```text
Build:  pnpm build:packages && pnpm --filter @dentalcare/worker build
Start:  pnpm --filter @dentalcare/worker start  → node dist/index.js
Long-running: YES
Graceful shutdown: SIGINT / SIGTERM (existing runtime)
SMTP: fail-closed unless explicit validated configuration enables processing
```

---

## 5. PostgreSQL (staging)

```text
Version:              16 (Render Blueprint postgresMajorVersion)
Extension:            btree_gist (CREATE EXTENSION in M4/M7 migrations)
GiST exclusions:      preserved (appointments, weekly intervals, unavailability)
Region (proposed):    singapore
Production database:  NOT MODIFIED by this guide
```

### Migration procedure (staging)

Authoritative command (non-destructive deploy of existing migrations):

```bash
pnpm db:migrate
# → prisma migrate deploy --schema prisma/schema.prisma
```

`render.yaml` sets this as the web service `preDeployCommand`.

Never run `prisma migrate reset` against remote staging/production.

Before first migrate: ensure the managed instance allows creating `btree_gist` (standard on Render Postgres). Migrations include `CREATE EXTENSION IF NOT EXISTS btree_gist`.

---

## 6. Environment variables

See `.env.example` for placeholders. Classification:

| Variable                                 | Build                | Runtime web               | Runtime worker       | Default / notes                                |
| ---------------------------------------- | -------------------- | ------------------------- | -------------------- | ---------------------------------------------- |
| `DATABASE_URL`                           | placeholder only     | required                  | required             | From Render DB link — never commit real values |
| `AUTH_PROVIDER`                          | unset                | unset until Cognito ready | unset                | `managed` only with real Cognito               |
| Cognito OIDC\_\* / `AUTH_SESSION_SECRET` | n/a                  | required if managed       | n/a                  | Dashboard secrets; sync:false in Blueprint     |
| `APP_BASE_URL`                           | placeholder          | required for redirects    | optional             | Set to staging HTTPS hostname after deploy     |
| `NOTIFICATION_*` / SMTP\_\*              | n/a                  | n/a                       | present but disabled | Keep processing false                          |
| `NODE_ENV`                               | production in images | production                | production           |                                                |
| `PORT`                                   | n/a                  | injected by host          | n/a                  |                                                |

Secrets: Render dashboard / env groups only. Never commit `.env`.

---

## 7. Cognito (staging requirements — not provisioned here)

When humans enable auth on staging:

```text
Region:            ap-south-1
User Pool ID:      <staging pool>
App Client ID:     <staging client>
Issuer:            https://cognito-idp.ap-south-1.amazonaws.com/<poolId>
Callback URL:      https://<staging-onrender-hostname>/api/auth/callback
Logout URL:        https://<staging-onrender-hostname>/
AUTH_PROVIDER:     managed
```

Do **not** register `dental.trinetralab.net` callbacks until that domain is approved and configured.

---

## 8. SMTP

```text
NOTIFICATION_PROCESSING_ENABLED=false
NOTIFICATION_PROVIDER=unset
NOTIFICATION_ALLOW_REAL_DELIVERY=false
```

Real SMTP remains a separate human decision. Do not send mail from staging until approved.

---

## 9. Cloudflare / custom domain

```text
dental.trinetralab.net: NOT CONFIGURED
DNS:                    DO NOT MODIFY YET
```

Future sequence after staging hostname exists:

```text
staging deployed → hostname verified → human approval
  → Cloudflare CNAME to Render hostname → HTTPS verify → smoke test
```

---

## 10. CI/CD

Existing `.github/workflows/ci.yml` remains the quality gate (no production deploy).

`.github/workflows/staging-infra.yml` validates that staging Docker/Render files exist and are well-formed. It does **not** deploy.

Render `autoDeployTrigger: "off"` — no automatic staging deploy on push.

---

## 11. Rollback considerations

- Prefer Render dashboard rollback / prior image deploy for web and worker.
- Database: forward-only Prisma migrations; do not reset remote DBs.
- Keep SMTP and Cognito flags fail-closed while diagnosing.

---

## 12. Secrets management

| Allowed in git                                    | Forbidden in git                                     |
| ------------------------------------------------- | ---------------------------------------------------- |
| `.env.example` placeholders                       | Real `DATABASE_URL`, Cognito secrets, SMTP passwords |
| `render.yaml` with `fromDatabase` / `sync: false` | Cloudflare API tokens, private keys                  |
| ADR + this guide                                  | Production credentials                               |

---

## 13. Local Docker validation

When Docker is available:

```bash
docker build -f Dockerfile.web -t dentalcare-web:staging .
docker build -f Dockerfile.worker -t dentalcare-worker:staging .
```

Do not point local containers at production databases or credentials.
