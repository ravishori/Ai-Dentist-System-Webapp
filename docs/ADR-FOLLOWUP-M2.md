# ADR follow-up — M2 authorization increment

This is **not** a silent amendment of TDA-ADR-001, TDA-ADR-002, or TDA-ADR-003.

## Numbering

TDA-IMP-M2-001 is the **Patient Domain** implementation plan. This delivery uses “M2” for the **authorization/tenant foundation** that ADR-FOLLOWUP-M1 deferred. Patient remains unimplemented.

## Catalog seed

TDA-ADR-002 lists patient and appointment permission keys for later domain binding. M2 seeds **foundation keys only** so unused clinical permissions cannot appear to authorize clinical APIs that do not exist.

## SYSTEM_ADMIN vs membership

TDA-ADR-002: `SYSTEM_ADMIN` is platform-scoped, not an ordinary membership privilege.

Implementation:

- `SYSTEM_ADMIN` is stored on `user_platform_roles`.
- Assigning `SYSTEM_ADMIN` as a membership role does not grant `security.manage`.
- A platform `SYSTEM_ADMIN` may exercise foundation tenant permissions against an **existing active organization** without a membership (break-glass). If that is too broad, a human should require an explicit tenant grant instead.

## Audit writes

`security_events` is created. M2 does not write an event on every authorization probe (TDA-ADR-002 does not require auditing every `organization.read`). Privileged mutation APIs will write audit rows when those APIs exist.

## Branches

`branches` is present. Authorization evaluation is organization-scoped in M2. Branch-scoped checks wait for clinical resources.
