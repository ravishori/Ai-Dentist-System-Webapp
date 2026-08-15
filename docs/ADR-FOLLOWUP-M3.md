# ADR follow-up — M3 Patient Domain Foundation

**Status:** PROPOSED (human approval required)  
**Date:** 2026-08-14  
**Depends on:** TDA-ADR-001, TDA-ADR-002, TDA-IMP-M2-001, ADR-FOLLOWUP-M1, ADR-FOLLOWUP-M2  
**This file is not an approved ADR.**

M3 implemented the Patient domain using already-approved permission names and organization tenancy. The items below were **not** silently decided as product policy. Where M3 needed a temporary engineering choice to remain secure, that choice is recorded as **implemented conservatively** and still requires human confirmation.

---

## Decisions requiring human approval

### 1. Patient deletion and retention

**Implemented:** no `DELETE` API; status may be set to `inactive` by holders of `patient.archive`. Foreign key is `ON DELETE RESTRICT` so organizations cannot cascade-delete patients.

**Still required:** hard-delete policy, retention period, legal hold, and whether inactive patients may be purged.

### 2. Duplicate patients and merge

**Implemented:** no unique constraint on email/phone; no matching or merge.

**Still required:** whether duplicates should be detected, blocked, or merged.

### 3. Patient identifier strategy

**Implemented:** existing repository cuid convention (opaque, non-sequential). Not email, phone, or national ID.

**Still required:** human confirmation that cuid remains the long-term patient identifier.

### 4. Patient-specific role semantics

**Implemented:** TDA-ADR-002 §12 mapping:

- STAFF / PRACTITIONER: create, read.tenant, update.tenant
- PRACTICE_ADMIN: those plus archive
- PATIENT role: no tenant patient APIs

**Still required:** confirmation that front-desk STAFF should create/update patients, and that PATIENT membership never implies portal access.

### 5. SYSTEM_ADMIN access to patients

**Implemented:** SYSTEM_ADMIN does **not** receive patient permissions and has **no** break-glass patient path. M2 foundation-only break-glass is unchanged.

**Still required:** explicit approval before any platform-admin patient access.

### 6. Patient self-access / portal

**Implemented:** `patient.read.self` / `patient.update.self` / `patient.preference.update` are not seeded and not evaluated.

**Still required:** product decision that Patient ≠ authenticated user for portal login.

### 7. Branch-scoped patients

**Implemented:** patients are organization-scoped only. No `branchId` on `patients`.

**Still required:** whether a later milestone associates patients with branches.

### 8. Patient-domain audit

**Implemented:** M2 `security_events` table exists; M3 does not write an event per patient API call.

**Still required:** which patient mutations are auditable, retention of audit records, and PII rules for audit payloads.

### 9. Concurrency

**Implemented:** `updatedAt` is maintained by Prisma; no optimistic locking / ETag.

**Still required:** whether concurrent demographic edits need conflict detection.

### 10. Organization transfer

**Implemented:** `organizationId` cannot be changed through PATCH.

**Still required:** whether a future milestone may move a patient between organizations.

### 11. Data retention and privacy review

**Implemented:** data minimization (no gender/address/national IDs/clinical fields); PII not logged.

**Still required:** privacy review, backup/recovery of patient rows, and production monitoring of patient APIs.

---

## Explicitly not claimed

- Production readiness
- Complete clinical auditability
- HIPAA/DPDP certification
- Appointment or clinical-record completeness

---

## Stop conditions that were respected

- M1 authentication was not redesigned.
- M2 authorization evaluator was not redesigned.
- SYSTEM_ADMIN was not expanded to patients.
- No clinical domain was started.
- No production AWS / Cognito / DNS changes were made.
- No real patient information was used.
