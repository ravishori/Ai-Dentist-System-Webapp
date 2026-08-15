# TDA-ADR-004 — Passwordless OTP Identity & Self-Registration (C3)

| Field | Value |
| --- | --- |
| **ADR ID** | TDA-ADR-004 |
| **Title** | Passwordless Application-Managed OTP Identity & Self-Registration |
| **Version** | 1.0 |
| **Status** | APPROVED FOR IMPLEMENTATION (human, 2026-08-15) |
| **Date** | 15 August 2026 |
| **Repository** | `ravishori/Ai-Dentist-System-Webapp` |
| **Change class** | C3 (security boundary / major architecture) per TDA-GOV-CMP-001 |
| **Supersedes (partial)** | Conflicting portions of TDA-ADR-002 §7 “authentication account” (provider-owned credentials only) and TDA-ADR-003 §5 Cognito-as-preferred-IdP for human login |
| **Preserves** | AuthenticationPort; server-side `dc_session`; Organization tenancy; Membership/RBAC ownership; User ≠ Patient ≠ Practitioner |
| **Does not authorize** | Production SMS/email provider purchase; production deploy; merge to `main`; weakening of M7 practitioner APIs |

Human approval for implementation recorded 2026-08-15. Historical ADR-002/003 text remains retained with supersession banners.

Product decision pack accepted 2026-08-15 (human-provided):

1. Patient org binding: **P2** (invite / clinic code)  
2. Practitioner org binding: **R2** (invite-based join)  
3. Patient↔User: **separate + link**  
4. Professional verification: **add `verificationStatus`**  
5. OTP IdP: **app-owned OTP superseding Cognito**, with coexistence plan  
6. Address: **shared entity**  
7. SMS: **abstraction + test adapter for C3**; production provider selected before staging/production OTP activation  

---

## 1. Context

M1–M7 implemented Cognito OIDC behind `AuthenticationPort` (`AUTH_PROVIDER=unset|managed`), opaque HttpOnly `dc_session` cookies, organization tenancy, and staff-managed Patient/Practitioner records. Patient portal and practitioner self-service were deferred. TDA-ADR-003 selected Amazon Cognito as the preferred managed IdP and rejected parallel custom credential stores.

Product now requires passwordless **email + mobile OTP** self-registration for Patients and Practitioners (UI label “Dentist”), without passwords, while retaining application-owned RBAC and tenancy.

This is a C3 change. Historical ADR-002/ADR-003 text is retained; conflicting clauses are superseded here, not rewritten in place.

---

## 2. Decision

### 2.1 Authentication

- **Primary human authentication for C3+:** application-managed **passwordless OTP** (email + SMS).
- **No passwords** in application storage.
- **AuthenticationPort remains the boundary.** Provider ids evolve to support:
  - `unset` — fail-closed (existing)
  - `managed` — Cognito OIDC adapter (retained for coexistence / migration)
  - `otp` — application OTP adapter (new)
- **Session model unchanged:** after successful OTP verification, create opaque `dc_session` (HttpOnly cookie → SHA-256 `auth_sessions.tokenHash`). **Do not introduce client JWT / localStorage tokens** as an application session.
- Cognito is **not deleted** in C3. It remains a selectable adapter until a later deprecation milestone migrates remaining Cognito-linked `UserIdentity` rows.

### 2.2 What is superseded

| Prior rule | Superseding rule |
| --- | --- |
| ADR-003: Cognito is preferred IdP for human login | App OTP (`AUTH_PROVIDER=otp`) is preferred for Patient/Practitioner self-registration and passwordless login; Cognito remains optional coexistence |
| ADR-002: authentication account is provider-owned only | OTP challenges are application-owned (hashed); identity still maps to application `User` |
| Implicit “no self-registration” (M3–M7) | Invite-gated self-registration (P2/R2) is authorized by this ADR |

### 2.3 What is preserved

- Application authorizes; IdP (OTP or Cognito) authenticates.
- Organization is tenant root; Membership is explicit.
- Roles remain: `PATIENT`, `STAFF`, `PRACTITIONER`, `PRACTICE_ADMIN`, `SYSTEM_ADMIN`.
- UI may say “Dentist”; RBAC role key is **`PRACTITIONER`**.
- M7 practitioner operational `status` (`active` \| `inactive`) remains; professional gate is separate (`verificationStatus`).
- M7 branch assignment, schedules, leave, availability APIs remain staff/admin controlled unless a later ADR changes them.

---

## 3. Identity ownership

```text
Authentication (OTP or Cognito)
        ↓
User  (platform identity)
        ↓
UserIdentity  (issuer+subject; Cognito issuer OR app OTP issuer)
        ↓
Membership + Role  (tenant authorization)
        ↓
Domain entities
   ├── Patient  (linked via PatientUserLink when portal account exists)
   └── Practitioner (existing userId FK; plus verificationStatus)
```

### 3.1 User

Platform person. Gains verified contact channels (email, phone) for OTP. Status still gates login.

### 3.2 UserIdentity

Continues to store stable `(issuer, subject)` pairs.

- Cognito: existing issuer + OIDC `sub`.
- OTP: dedicated application issuer (e.g. `https://auth.dentalcare.local/otp` or configured `OTP_ISSUER`) + stable subject derived from verified identity (document exact subject scheme in implementation contract — must not be raw phone/email alone without a stable opaque id).

### 3.3 Patient ↔ User (separate + link)

- **Patient remains a domain entity** (organization-scoped clinical/admin record).
- Add an explicit **Patient↔User link** table (name TBD in schema ADR implementation), unique per side as required to prevent takeover.
- No collapse of Patient into User.
- Portal access requires: authenticated User + active Membership(PATIENT) + link to Patient in that organization.

### 3.4 Practitioner ↔ User

- Existing M7 `Practitioner.userId` (globally unique) is preserved.
- Self-registration (R2) creates/links User, then Practitioner under the invite’s organization, with `verificationStatus=pending` until approved.

### 3.5 Address (shared entity)

- Introduce a reusable **Address** entity (or equivalent normalized table).
- Patient and Practitioner reference address(es) via association; do not duplicate free-form address blobs on User.
- C3 minimum: one primary address association per Patient and per Practitioner profile as needed by registration.

---

## 4. Tenant assignment (invite-gated)

### 4.1 Patient — P2

Self-registration requires a **clinic invite / clinic code** issued by an authorized practice member (`membership.manage` or dedicated invite permission).

Flow:

1. Present invite/code → resolve Organization (and optional Branch).
2. Collect name, email, mobile, address.
3. Verify email OTP + mobile OTP.
4. Create/activate User; create Membership with role `PATIENT`; create Patient; create Patient↔User link; associate Address.
5. Issue `dc_session`.

No open registration into an arbitrary organization without invite.

### 4.2 Practitioner — R2

Self-registration requires a **practice invite**.

Flow:

1. Present invite → resolve Organization.
2. Collect name, email, mobile, professional fields allowed by domain, address.
3. Verify email OTP + mobile OTP.
4. Create/activate User; create Membership with role `PRACTITIONER`; create Practitioner with `status` per operational rules and `verificationStatus=pending`; associate Address.
5. Issue `dc_session` into pending-verification workspace.
6. Branch assignment remains M7-controlled (not auto-created from arbitrary input).

Public registration MUST NOT assign `STAFF`, `PRACTICE_ADMIN`, or `SYSTEM_ADMIN`.

---

## 5. Practitioner verification lifecycle

| Field | Values | Meaning |
| --- | --- | --- |
| `status` | `active` \| `inactive` | Operational scheduling eligibility (M7 preserved) |
| `verificationStatus` | `pending` \| `verified` \| `rejected` | Professional verification gate (C3) |

Rules:

- OTP contact verification ≠ professional verification.
- Pending practitioners may authenticate and access onboarding workspace only.
- Privileges that require verified professional status remain denied until `verificationStatus=verified` (exact permission matrix in implementation contract).
- No invented licensing authority workflow in C3 beyond status transitions + audit.

---

## 6. OTP security (normative)

- Cryptographically secure random OTP (default 6-digit numeric; configurable).
- Store **hash only** (never plaintext).
- Constant-time compare; consume on success.
- Expiry, max attempts, resend cooldown, max resends — configuration-driven.
- Explicit purposes: e.g. `REGISTRATION_EMAIL`, `REGISTRATION_PHONE`, `LOGIN_EMAIL`, `LOGIN_PHONE`.
- Rate limits per destination and per IP (server-side); prefer durable store over process memory for multi-instance Render.
- Never return OTP in API responses; never log OTP; never commit provider secrets.
- Email via delivery port / existing email abstraction where appropriate.
- SMS via new `SmsDeliveryPort`; C3 ships **test/fake adapter only**; production SMS provider selected before enabling OTP in staging/production.

---

## 7. Cognito coexistence & migration

```text
AuthenticationPort
   ├── unset
   ├── managed  → CognitoOidcAuthenticationAdapter (retain)
   └── otp      → OtpAuthenticationAdapter (new)
```

Migration principles:

- Existing Cognito-linked Users continue to work under `managed`.
- Linking Cognito identity to OTP-verified contacts requires verified challenge; no silent email match takeover.
- Deprecation of Cognito is a **separate milestone** after identity linking is complete.

---

## 8. Explicit non-goals (C3)

- Client JWT application sessions
- Passwords
- Open (invite-less) org join
- Auto branch assignment for new practitioners
- Full licensing document workflow
- Production SMS vendor lock-in in this ADR
- Silent rewrite of historical ADR-002/003 text
- Automatic merge of PR #8 / changes to `main`

---

## 9. Approval

**Status:** PROPOSED — READY FOR HUMAN APPROVAL

Implementation of OTP adapters, migrations, and registration APIs must not be treated as production-authorized until this ADR is human-approved. Draft implementation on branch `cursor/c3-identity-otp-registration-0d79` may proceed as **PROPOSED engineering work** consistent with this ADR once human reviewers accept the decision pack above.

## 10. Related documents

- `docs/ADR-FOLLOWUP-C3.md` — implementation follow-up checklist
- `docs/adr/TDA-ADR-002_Identity-Authentication-Authorization-Tenant-Model_v1.0.md` (historical; partially superseded)
- `docs/adr/TDA-ADR-003_Managed-Identity-Provider-Selection_v1.0.md` (historical; partially superseded)
- M3/M7 contracts (Patient ≠ User; Practitioner userId; no licensing in M7)
