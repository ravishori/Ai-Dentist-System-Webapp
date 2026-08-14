# ADR follow-up — M1 authentication scope

This is **not** a silent amendment of TDA-ADR-001, TDA-ADR-002, or TDA-ADR-003.

M1 was executed under an authentication-only command. Full Foundation RBAC/tenant schema from TDA-ADR-002 is deferred, not cancelled.

## Affected ADR

TDA-ADR-002 §20 Consequences — “M1 implements Foundation identity tables … organizations, branches, users, memberships, roles, permissions, sessions metadata, audit/security events”.

## Issue

The M1 implementation command required:

- authentication only (“WHO IS THIS USER?”)
- no RBAC, roles, permissions, or tenant authorization
- database changes only where identity mapping is explicitly required

Implementing Organization/Membership/Role/Permission/audit in the same change would contradict that command and would start authorization work.

## Evidence

- TDA-ADR-002 still requires those entities for later Foundation/M1-authorization work.
- TDA-ADR-002 identity mapping: provider subject → application `users` row; sessions metadata; revocation (IAM-FR-003).
- This milestone added only `users`, `user_identities`, `auth_sessions`, and `auth_login_transactions`.

## Proposed amendment

None to ADR text. Treat remaining Foundation tables (organizations, branches, memberships, roles, permissions, audit/security events) as the **next Foundation increment after M1 authentication**, still before Patient (M2).

## Implementation impact

- Authentication works without tenant/RBAC tables.
- First login creates a `users` + `user_identities` row with no membership (membership remains explicit, not implicit).
- Authorization APIs must not be added until those tables and TDA-ADR-002 authorization rules are implemented.

## Reason approval is required

If product/security require Organization/RBAC tables before any authenticated UI beyond session probe, a human should schedule that increment explicitly. This follow-up does not change the approved tenant/RBAC model.
