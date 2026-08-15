# ADR-IMP-005 — Staging hosting topology (Render)

**Status:** PROPOSED — READY FOR HUMAN APPROVAL  
**Date:** 2026-08-15  
**Milestone:** Infrastructure (separate from product M7 practitioner availability)  
**Supersedes:** Open “Hosting platform” / “Production deployment topology” items listed in TDA-ADR-001 §21 for **staging** only  
**Does not authorize:** production deployment, DNS changes, Cognito provisioning, SMTP enablement, merge to `main`, or M8

---

## 1. Context

TDA-ADR-001 leaves hosting and production deployment topology undecided. Product M7 (practitioner management and availability) is implemented on draft PR #8 and does not select a host.

The application is a modular monolith:

```text
apps/web     Next.js 15 (Node.js) + force-dynamic API routes
apps/worker  long-running Node outbox poller (fail-closed SMTP)
PostgreSQL   Prisma migrations with btree_gist + GiST exclusions (M4/M7)
```

A read-only architecture assessment concluded that a **container platform** fits better than Vercel-only or Cloudflare Workers for the current worker + GiST PostgreSQL topology. Render is proposed as the default **staging** provider.

Parent DNS for `trinetralab.net` is already on Cloudflare (external observation). Custom domain `dental.trinetralab.net` remains **NXDOMAIN** and must not be configured until staging hostname verification and human approval.

---

## 2. Decision (PROPOSED)

| Layer | Choice |
| --- | --- |
| Staging compute | Render |
| Web | Docker image `Dockerfile.web` → `next start` on `$PORT` |
| Worker | Docker image `Dockerfile.worker` → `node` worker entry (`pnpm --filter @dentalcare/worker start`) |
| Database | Render Managed PostgreSQL **16** with `btree_gist` (created by existing migrations) |
| Region (staging) | Singapore (closest Render region to India; Cognito remains `ap-south-1`) |
| DNS | Cloudflare (future); **do not modify yet** |
| Auth | Amazon Cognito User Pools `ap-south-1` (ADR-003); staging pool **not** provisioned by this ADR |
| Email | SMTP disabled (`NOTIFICATION_PROCESSING_ENABLED=false`) until separately approved |
| Auto-deploy | Off (`autoDeployTrigger: "off"`) — human-authorized deploys only |

Repository Blueprint: `render.yaml` (staging service names `*-staging`).

---

## 3. Alternatives considered

| Option | Why not selected for staging now |
| --- | --- |
| Vercel-only | Excellent for Next.js; poor fit for long-running worker without a second host |
| Cloudflare Pages/Workers | Edge/runtime friction with Prisma monorepo + long-lived worker; GiST needs real Postgres |
| AWS ECS/App Runner | Capable; higher operational complexity before production readiness ADRs |
| Railway / Fly.io | Acceptable container peers; Render chosen as the default staging family unless humans prefer another |

Production may confirm Render or select a different provider in a **separate** approval. This ADR does not freeze production.

---

## 4. Consequences

- Staging infrastructure configuration lives in-repo as **IMPLEMENTED IN REPOSITORY**, not **DEPLOYED**.
- Humans must approve this ADR, create the Render Blueprint resources, set dashboard secrets, and authorize the first staging deploy.
- `dental.trinetralab.net` stays unconfigured until a staging hostname exists and DNS is explicitly approved.
- M4/M7 GiST exclusions remain authoritative; managed Postgres must allow `btree_gist`.
- Product M7 application logic is unchanged by this ADR.

---

## 5. Approval requirement

| Role | Action |
| --- | --- |
| Architect / Technical Owner | Approve or reject this ADR |
| Human reviewer | Confirm Render staging region, Postgres plan, and secrets handling |
| Cursor / implementation | Must not self-approve |

Until approved, treat Render staging as **PROPOSED** configuration only.

---

## 6. Change history

| Date | Change |
| --- | --- |
| 2026-08-15 | Initial PROPOSED staging hosting decision (Render + Docker + managed Postgres 16) |
