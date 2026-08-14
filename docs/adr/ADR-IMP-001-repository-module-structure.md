# ADR-IMP-001 — Repository / module structure

Status: Proposed (TDA-IMP-001 listed this as an open ADR)
Date: 2026-08-14
Milestone: M0

## Decision

Use a pnpm workspace with:

```
apps/web
apps/worker
packages/domain
packages/application
packages/db
packages/contracts
packages/config
packages/test-utils
tests/e2e
tests/integration
docs
scripts
.cursor/rules
```

Domain boundaries Foundation, Patient, Appointment, and Notification are folders inside `packages/domain` and `packages/application`, not separate packages.

## Rationale

TDA-IMP-M0-002 allows simplifying package count. Separate packages per domain would add workspace overhead without M0 behavior. Boundaries remain mandatory and are encoded as TypeScript modules.

## Consequences

- Later milestones add behavior inside the existing boundary folders.
- A further package split requires a new ADR.
