# TDA-ADR-003 — Managed Identity Provider Selection

| Field               | Value                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| **ADR ID**          | TDA-ADR-003                                                                                    |
| **Title**           | Managed Identity Provider Selection                                                            |
| **Version**         | 1.0                                                                                            |
| **Status**          | PROPOSED — READY FOR HUMAN APPROVAL — **partially superseded by TDA-ADR-004 (2026-08-15) for preferred human IdP** |
| **Date**            | 14 August 2026                                                                                 |
| **Repository**      | `ravishori/Ai-Dentist-System-webapp`                                                           |
| **Change class**    | C3 (major architecture decision) per TDA-GOV-CMP-001                                           |
| **Follows**         | TDA-ADR-001 v1.0; TDA-ADR-002 v1.0                                                             |
| **Implements**      | TDA-SEC-001 ADR-SEC-001 (provider selection); TDA-IMP-M0-002 / TDA-IMP-M1-001 identity boundary |
| **Does not do**     | Authentication implementation; SDK addition; Prisma/schema change; environment secrets         |
| **Supersession**    | Historical text retained. Cognito-as-**preferred** human IdP (§5) is superseded by **TDA-ADR-004** (app-owned OTP preferred; Cognito retained for coexistence). Cognito adapter implementation and OIDC mapping rules remain valid for `AUTH_PROVIDER=managed`. |

AI-generated documentation is non-authoritative until reviewed and approved (TDA-GOV-SOT-001 §16, TDA-GOV-CMP-001 §14). Cursor MUST NOT mark this ADR APPROVED.

> **Supersession notice (TDA-ADR-004):** Preferred human authentication for C3+ is application-managed passwordless OTP. Amazon Cognito remains an optional managed adapter and must not be deleted in C3.

Research date for vendor pages cited below: **14 August 2026**. Claims that could not be verified from official sources are marked **UNKNOWN**.

---

## 1. ADR ID

TDA-ADR-003

## 2. Title

Managed Identity Provider Selection for the DentalCare AI web application

## 3. Status

PROPOSED — READY FOR HUMAN APPROVAL

Upon human approval, this ADR names the authentication vendor that sits behind the application `AuthenticationPort`. It does not authorize implementation in this document. Implementation remains a later M1 task after this ADR and TDA-ADR-001 / TDA-ADR-002 are approved.

## 4. Date

14 August 2026

## 5. Decision

**Preferred provider:** Amazon Cognito user pools, **Essentials** feature plan, used strictly as an OIDC-compatible managed identity provider.

**Recommended product shape:**

- One Cognito **user pool** per environment (at minimum development and production).
- Application authentication via the user pool as an **OIDC issuer**.
- Token verification via JWKS (`https://cognito-idp.<region>.amazonaws.com/<userPoolId>/.well-known/jwks.json`).
- Map the stable OIDC `sub` (and verified email) to the application `User`.
- Application remains the source of truth for Organization, Branch, Membership, Role, Permission, tenant context, RBAC, object-level authorization, and audit.

**Recommended identity data region (pending hosting ADR alignment):** Asia Pacific (Mumbai) `ap-south-1`, because Cognito user pools store profile data in the pool’s AWS Region and that region is listed in the official Cognito Identity endpoints reference.

**Explicit non-use of Cognito product surfaces:**

- Do **not** use Cognito **groups** as the application RBAC source of truth.
- Do **not** use Cognito **Identity Pools** (AWS credential federation) as the application authentication model.
- Do **not** require AWS Amplify as the integration path. Amplify is optional later; the approved boundary is OIDC + adapter + `AuthenticationPort`.
- Do **not** store Patient clinical records, appointment data, or other domain payloads in Cognito attributes.

**Second choice:** Auth0 **B2C Essentials**, used as IdP-only (not Auth0 Organizations / Auth0 RBAC as application authorization).

**Rejected / less suitable:** Clerk; Microsoft Entra External ID; Supabase Auth.

No additional candidate was added. Popularity alone is not a reason to evaluate further vendors. TDA-ADR-002 already deferred vendor selection and rejected picking Auth0/Cognito/Clerk/Firebase without this ADR’s evidence.

---

## 6. Context

TDA-ADR-001 selected a TypeScript modular monolith: Next.js App Router, PostgreSQL/Prisma, Node worker, transactional outbox. TDA-ADR-002 selected the identity architecture:

- Managed or equivalently operated OIDC-compatible identity provider authenticates.
- The application authorizes.
- Tenant model is Organization → Branch → Membership → Role → Permission.
- Provider identity maps to application User; membership is application-owned.
- Exact vendor was deferred to this ADR.

M0 code exposes `AuthenticationPort` with `AuthProviderId = "unset" | "managed"` and does not implement login. TDA-IMP-M1-001 requires an approved authentication mechanism before provider integration. TDA-IMP-M0-002 and TDA-SEC-001 forbid a custom in-app password system.

This ADR selects the vendor. It does not implement authentication.

### Conflict check against approved / governing sources

| Source                         | Constraint relevant to provider choice                                                                                         | Result for this decision                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| TDA-GOV-SOT-001                | REVIEW docs are provisional; Cursor must not self-approve                                                                      | Status remains PROPOSED                                                                                           |
| TDA-ADR-001                    | Next.js / TypeScript modular monolith                                                                                          | Provider must integrate with Next.js App Router and API route handlers                                            |
| TDA-ADR-002                    | Provider authenticates; app owns authorization/tenant/RBAC; OIDC-compatible; replaceable behind `AuthenticationPort`           | Selected provider used as IdP-only                                                                                |
| TDA-IMP-M0-002                 | No custom password system; no deep vendor integration until identity ADR                                                       | This ADR selects; does not integrate                                                                              |
| TDA-IMP-M1-001                 | Mechanism must be defined before M1 security implementation                                                                    | Vendor now named; integration still blocked until human approval                                                  |
| TDA-SEC-001                    | Managed provider; dedicated provider ADR (ADR-SEC-001)                                                                         | This document is that ADR                                                                                         |
| IAM-FR-001…005 (TDA-FRS-001)   | Identity, RBAC, sessions, MFA **capability**, tenant isolation                                                                 | Cognito Essentials provides MFA capability; app remains RBAC SoT                                                  |
| BRD-015 / DDD Domain 1         | Multi-tenant organization isolation; primary market India                                                                      | Application tenant model unchanged; Cognito `ap-south-1` is an official identity-data region option               |
| TDA-API-001                    | API authentication; never trust client tenant/role                                                                             | JWT/OIDC verification on the server; tenant from membership                                                       |

**No STOP conflict was found** between an approved requirement and this recommendation, provided Cognito is used as IdP-only and application authorization remains in-app. If a later approved privacy policy **mandates** identity PII residency in India **and** forbids AWS Mumbai, this decision must be reopened. That mandate is not present in the current approved set.

---

## 7. Requirements

### Must support (authentication)

- Secure authentication for staff, practitioner, patient, and future admin accounts
- Email verification
- Password reset where password credentials are used
- MFA **capability** (policy remains TDA-SEC-001 ADR-SEC-002)
- Session management / token lifetime
- OIDC/OAuth compatibility
- JWT (or equivalent session) validation with key rotation via JWKS or documented equivalent
- Next.js App Router compatibility (SSR, route handlers, server/client components)
- API authentication for `apps/web` route handlers and future worker-to-user flows as needed
- Scalable user management
- Mapping provider subject → application User
- Multi-tenant **application** architecture (provider need not own tenants)

### Must not own (authorization / domain)

- Patient / Appointment / Notification permissions
- Tenant authorization
- Application RBAC
- Business rules
- Clinical records (must remain application-controlled; not IdP metadata)

### Architectural preference (TDA-ADR-002)

```
Provider identity
       ↓
Application User
       ↓
Application Membership
       ↓
Application Tenant (Organization + optional Branch)
       ↓
Application Authorization
```

---

## 8. Candidates

Evaluated (mandatory set):

1. **Auth0** (Okta CIAM) — B2C plans considered; B2B Organizations product considered only as a lock-in risk, not as the application tenant store.
2. **Clerk** — Hobby / Pro / Business plus B2B Authentication add-on.
3. **Amazon Cognito** — user pools, Lite / Essentials / Plus feature plans.
4. **Microsoft Entra External ID** — external tenant / CIAM offering (not workforce Entra ID as the primary product).
5. **Supabase Auth** — hosted Auth on a Supabase project (JWT + GoTrue).

No sixth candidate. Firebase Auth / Appwrite / Keycloak were not scored: Firebase was already declined as a premature pick in TDA-ADR-002; Keycloak would be self-hosted operations, which is an acceptable *category* in ADR-002 but is not a managed provider and was not requested.

---

## 9. Evaluation Criteria

Weights are **not adjusted**. They match the task model and sum to 100%.

| ID | Criterion                         | Weight | What is scored                                                                                          |
| -- | --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| C1 | Security & identity capability    | 25%    | OIDC quality, attack protection, admin/security posture, token model, not compliance slogans            |
| C2 | Next.js / API integration         | 15%    | App Router, SSR, route handlers, middleware/proxy, server/client session retrieval, API JWT validation  |
| C3 | Multi-tenant compatibility        | 15%    | Ability to remain IdP-only vs forcing vendor orgs/RBAC/RLS as authorization SoT                         |
| C4 | MFA / session / recovery          | 10%    | MFA factors, email verify, password reset, session controls, account recovery                           |
| C5 | Developer experience              | 10%    | Docs, hosted UI, operational effort — **not** a selection tie-breaker by itself                         |
| C6 | Cost                              | 10%    | Realistic LOW / MEDIUM / GROWTH cost drivers in official billing currency; not free-tier chasing        |
| C7 | Privacy / data controls           | 5%     | Region options, residency, export/deletion, subprocessors; India relevance; no invented FX              |
| C8 | Portability / vendor lock-in      | 5%     | OIDC portability, export, password migration, proprietary SDK/org/RBAC gravity                          |
| C9 | Operations / admin controls       | 5%     | Logs, admin console, webhooks/events, support path                                                      |

**Scoring scale:** 0–10 integers per criterion. Weighted total = Σ(score × weight). Maximum 10.00.

**Assumptions applied to every score:**

- Application authorization stays in DentalCare AI (TDA-ADR-002). Vendor org/RBAC/RLS features, if used as SoT, are scored as **negative** multi-tenant fit.
- Production MFA capability is required (IAM-FR-004). Plans that omit MFA on the would-be production SKU are penalized.
- Clinical data is never stored in the IdP.
- Hosting of the application database is still an open TDA-ADR-001 decision; identity-data region is evaluated independently.
- No INR conversion is used (no official exchange rate is adopted here).
- Entra External ID overage price above 50,000 MAU is **UNKNOWN** on public Microsoft pages (`$-` / calculator login). That UNKNOWN is a scoring penalty for Cost, not a fabricated unit price.

---

## 10. Weighted Scorecard

| Criterion (weight)               | Auth0 | Clerk | Cognito | Entra External ID | Supabase Auth |
| -------------------------------- | ----: | ----: | ------: | ----------------: | ------------: |
| C1 Security (25%)                |     9 |     7 |       8 |                 8 |             6 |
| C2 Next.js / API (15%)           |     9 |    10 |       6 |                 5 |             7 |
| C3 Multi-tenant fit (15%)        |     7 |     4 |       9 |                 6 |             3 |
| C4 MFA / session / recovery (10%)|     8 |     7 |       8 |                 8 |             6 |
| C5 Developer experience (10%)    |     8 |    10 |       5 |                 5 |             7 |
| C6 Cost (10%)                    |     4 |     7 |       9 |                 5 |             8 |
| C7 Privacy / data (5%)           |     4 |     3 |       8 |                 5 |             7 |
| C8 Portability (5%)              |     6 |     3 |       8 |                 7 |             4 |
| C9 Operations (5%)               |     8 |     6 |       7 |                 8 |             5 |
| **Weighted total**               | **7.55** | **6.85** | **7.60** | **6.45** | **5.90** |

Weighted arithmetic (Cognito example):  
`8×0.25 + 6×0.15 + 9×0.15 + 8×0.10 + 5×0.10 + 9×0.10 + 8×0.05 + 8×0.05 + 7×0.05 = 7.60`.

**Rank:** 1 Cognito (7.60) · 2 Auth0 (7.55) · 3 Clerk (6.85) · 4 Entra External ID (6.45) · 5 Supabase Auth (5.90).

Cognito is not selected because it is easiest. Clerk and Auth0 score higher on developer experience and Next.js SDK polish. Cognito is selected because the weighted model, with security and **application-owned tenancy** ahead of DX, plus official India-region identity storage and sustainable MAU pricing, places it first. The margin over Auth0 is small; Auth0 remains a viable fallback IdP.

---

## 11. Provider-by-Provider Analysis

### 11.1 Amazon Cognito (preferred)

| Topic                    | Finding                                                                                                                                                                                                 | Evidence |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Product                  | User pools are OIDC issuers. New pools default to **Essentials**. Lite / Essentials / Plus are switchable.                                                                                              | AWS Cognito pricing |
| Auth features            | Password, social, SAML/OIDC federation, Managed Login / hosted UI. Essentials adds passwordless (passkeys, email, or SMS) and access-token customization.                                               | AWS Cognito pricing |
| MFA                      | TOTP and SMS MFA documented. Email MFA and passkeys require Essentials or higher. SMS billed via Amazon SNS (extra).                                                                                    | Cognito MFA developer guide; pricing page |
| Email verification       | Supported; email delivery via Amazon SES when not using the default Cognito mailbox (SES billed separately).                                                                                            | Cognito pricing; regional data considerations |
| Password reset           | Supported as a user-pool recovery flow.                                                                                                                                                                 | Cognito user pool docs |
| OIDC / JWT               | RS256 JWTs; JWKS published per pool; key rotation via `kid`; AWS recommends `aws-jwt-verify` or any reputable JWT library.                                                                              | Verifying JWTs developer guide |
| Organizations            | **No native organization product** equivalent to Clerk Organizations / Auth0 Organizations. Groups exist but must not become app RBAC.                                                                  | Product model |
| Next.js                  | No first-party Next.js App Router auth SDK comparable to Auth0/Clerk. Official paths: generic OIDC + JWT verify; optional Amplify SSR.                                                                  | JWT verify guide; Amplify Next.js SSR docs |
| Custom domain            | Custom domains for hosted UI exist as a Cognito feature. Exact SKU/cost for a dentalcare custom domain: **UNKNOWN** without an AWS quote for that account.                                              | Not priced on the Cognito MAU table |
| Admin / logs             | AWS Console, CloudWatch, user-pool APIs. Plus tier adds threat protection and authentication-event export.                                                                                              | Pricing (Plus) |
| Export / migration       | CSV import does not import passwords (users reset). Password migration from an existing directory can use a migration Lambda trigger. ListUsers / Admin APIs export profiles.                           | Import tool developer guide |
| India / region           | User-pool profile data stored in the pool Region. `ap-south-1` (Mumbai) is listed. Optional features (Pinpoint, some SMS/email routing) may leave the Region.                                           | AWS regions reference; regional data considerations |

**Fit:** Strongest alignment with TDA-ADR-002’s “provider identity → application User → application membership” chain. Weakest first-party Next.js DX among the commercial CIAM options.

### 11.2 Auth0 (second choice)

| Topic              | Finding                                                                                                                                                          | Evidence |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Plans              | Free 25k MAU; B2C Essentials from USD 35 / 500 MAU; B2C Professional from USD 240 / 500 MAU; Enterprise contact sales. Yearly = 11× monthly.                     | auth0.com/pricing |
| MFA                | Pro MFA **not** on Free; **included** on B2C Essentials. Enterprise MFA included on B2C Essentials table (B2B table lists it as add-on on Essentials). Adaptive MFA is Enterprise add-on. | Pricing feature tables |
| Passwordless       | Included on Free and paid. Passkeys included.                                                                                                                    | Pricing |
| Attack protection  | Brute force + suspicious IP throttling on Free+. Enhanced password protection / basic breached-password detection from Professional. Bot detection Enterprise add-on. | Pricing |
| Next.js            | Official `@auth0/nextjs-auth0` v4: App Router, `getSession`, middleware (Next.js 15) / proxy (Next.js 16), `/auth/login|callback|logout`.                        | Auth0 Next.js quickstart; SDK docs |
| Organizations      | Native Organizations (5 on Free, 10 on B2C Essentials, unlimited** on B2B). **Must not** become DentalCare tenant/RBAC SoT.                                      | Pricing; ADR-002 |
| Custom domain      | 1 on Free (credit-card verification).                                                                                                                            | Pricing |
| Export             | Import/Export extension and Management API bulk export. **Password hashes are not in bulk export** unless requested via support ticket.                          | Data export and transfer policy |
| Regions            | Public Cloud: United States, United Kingdom, Europe, Australia, Japan, Canada. **India is not a Public Cloud region.** Private Cloud on AWS lists India; Private Cloud is Enterprise. | Auth0 cloud deployment; Private Cloud on AWS docs |
| HIPAA/BAA          | Listed as Enterprise **ADD-ON** on the pricing table. This ADR does **not** claim HIPAA compliance.                                                              | Pricing |

**Fit:** Excellent CIAM and Next.js SDK. Rejected as first choice because Public Cloud cannot keep identity data in India, MAU pricing scales steeply, and Organizations/RBAC create vendor-gravity that ADR-002 forbids using as SoT. Viable if humans accept non-India identity residency and higher cost.

### 11.3 Clerk (less suitable)

| Topic         | Finding                                                                                                                                     | Evidence |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Pricing       | Hobby free, 50k MRU/app, **no MFA**, 7-day fixed sessions. Pro USD 25/mo (USD 20 annual) includes MFA, passkeys, 50k MRU then USD 0.02/MRU. | clerk.com/pricing |
| B2B           | Organizations included (100 MROs, 20 members). Enhanced B2B add-on USD 100/mo for unlimited members, custom roles, org-scoped SSO.           | Pricing |
| Next.js       | First-class App Router: `auth()`, `auth.protect()`, `clerkMiddleware` / proxy.                                                              | Clerk Next.js docs |
| Authorization | Official guides check `has({ role })` / `auth.protect({ permission })` against **Clerk** Organization roles.                                | Clerk authorization docs |
| MFA           | Not on Hobby. Pro+ required for production MFA (IAM-FR-004).                                                                                | Pricing |
| Privacy       | DPA: hosts personal data **primarily in Google Cloud and Cloudflare**; Privacy Policy allows processing “anywhere in the world, including the United States”. No India region option found. | Clerk DPA; Privacy Policy |
| Export        | Dashboard full data exports on all plans. Password-hash portability: **UNKNOWN** from public pricing/export FAQ.                            | Pricing FAQ |
| HIPAA         | Pricing table: HIPAA on Business; Enterprise “HIPAA compliance available with BAA”. Not claimed for DentalCare.                             | Pricing |

**Fit:** Best DX, poorest architectural fit. Using Clerk “the way the docs teach” would make Clerk Organizations/RBAC the authorization engine, which contradicts TDA-ADR-002. Using Clerk as IdP-only fights the product.

### 11.4 Microsoft Entra External ID (less suitable)

| Topic        | Finding                                                                                                                                                          | Evidence |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Product      | External tenant for customer/consumer apps; workforce tenant is a different configuration.                                                                       | Learn: External tenant features |
| Pricing      | First 50,000 MAU free (Basic). Public Microsoft pricing pages show overage as `$-` / “see Azure calculator”. **USD/MAU above 50k = UNKNOWN** from public HTML.   | microsoft.com pricing; azure.microsoft.com/pricing/details |
| Add-ons      | SMS metered; M2M transaction-based; **Go-Local only Australia or Japan** (not India).                                                                            | Learn: External ID pricing (updated 2026-06-22) |
| MFA / reset  | MFA documented; SSPR via email OTP or SMS in external tenants. SMS not available as first-factor / SSPR in some external-tenant notes; SMS as second factor extra. | FAQ; feature comparison |
| ID Protection / Governance | **Not available** in external tenants.                                                                                                                    | Feature comparison |
| Next.js      | Microsoft identity platform / MSAL patterns exist; not a Next.js-first App Router session SDK like Auth0/Clerk. Integration effort is real.                      | Product model |
| Operations   | Requires Azure subscription linked to the tenant.                                                                                                                | Learn pricing article |
| Groups/roles | Groups/app roles being phased into customer tenants — **must not** replace application RBAC.                                                                     | Feature comparison |

**Fit:** Capable CIAM inside Azure. Rejected as preferred because (1) overage unit price cannot be verified from official public pages, (2) Go-Local does not include India, (3) Azure operational coupling, (4) weaker Next.js-native session story. **STOP was not triggered for the whole ADR** because this candidate is not the recommendation; its overage price remains UNKNOWN.

### 11.5 Supabase Auth (less suitable)

| Topic           | Finding                                                                                                                                                         | Evidence |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Pricing         | Free 50k MAU (projects pause after 1 week inactivity). Pro from USD 25/mo includes 100k MAU then USD 0.00325/MAU, plus **compute**. Phone MFA USD 75/mo first project. | supabase.com/pricing |
| Auth            | Email/password, OAuth, OTP, JWT. Basic TOTP MFA included. Leaked-password protection / session timeouts from Pro.                                               | Pricing Auth table |
| Next.js         | Official `@supabase/ssr` App Router cookie helpers.                                                                                                             | Supabase Auth Next.js guide |
| Authorization   | Product positioning: authorization via **Postgres RLS rather than application code**. That is the opposite of TDA-ADR-002.                                      | supabase.com/auth (product model) |
| Data store      | Identity lives in the **Supabase project Postgres**, not in DentalCare Prisma. Second database and dual-migration risk.                                         | Platform model |
| Regions         | South Asia (Mumbai) `ap-south-1` is a listed specific region.                                                                                                   | Supabase regions docs |
| HIPAA           | Available as **paid add-on on Team+**. Not claimed here.                                                                                                        | Pricing |
| JWT model       | Historically HMAC JWT secret in addition to / instead of a pure JWKS OIDC issuer story. Portability is weaker than a generic OIDC IdP. Exact current signing mode mix: treat OIDC-portability as **partial / higher lock-in**. | Auth docs / Next.js guide |

**Fit:** Inexpensive and India-region capable, but it would pull identity into a second Postgres and encourages RLS as the authorization SoT. That fights the modular monolith’s Prisma/application authorization boundary.

---

## 12. Security Analysis

This section states **capabilities**, not compliance certifications for DentalCare AI. No provider is declared “HIPAA compliant”, “GDPR compliant”, or “DPDP compliant”.

| Control                         | Cognito                                                                                          | Auth0                                                                 | Clerk                                                          | Entra External ID                                      | Supabase Auth                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------- |
| MFA                             | TOTP/SMS; email MFA + passkeys on Essentials+                                                    | Pro MFA on Essentials+; not on Free                                   | Pro+ only                                                      | Supported in external tenants                          | Basic TOTP included; phone MFA paid add-on         |
| Phishing-resistant              | Passkeys / WebAuthn on Essentials+                                                               | WebAuthn / passkeys documented                                        | Passkeys on Pro+                                               | Passkeys/FIDO: confirm per tenant SKU — treat extra factors as **verify at implementation** | UNKNOWN beyond TOTP/phone                          |
| Session / tokens                | JWT access/ID/refresh; `exp`/`iss`/`aud`/`token_use` checks required                             | Session SDK + JWT APIs                                                | Session cookies; custom duration on Pro                        | Microsoft identity tokens                              | JWT + cookies via `@supabase/ssr`                  |
| Key rotation                    | RSA keys per pool; JWKS `kid`; docs require cache refresh on unknown `kid`                       | JWKS                                                                  | Clerk JWKS / session tokens                                    | Microsoft JWKS                                         | Project JWT secret / signing — higher app coupling |
| Account recovery                | Password recovery + MFA recovery paths documented                                                | Password reset + recovery codes                                       | Password reset / email links                                   | SSPR email OTP or SMS                                  | Recovery email/OTP                                 |
| Brute-force                     | Service-side throttling exists; Plus adds adaptive/risk                                          | Brute force + IP throttling included                                  | Account lockout + bot protection all plans                     | Platform protections; ID Protection **not** in external tenants | Pro leaked-password protection                     |
| Anomaly / risk                  | **Plus** tier (compromised credentials, adaptive auth). Essentials does **not** include Plus threat protection. | Adaptive MFA Enterprise add-on; breached password from Professional   | Not equivalent to Cognito Plus / Auth0 Professional on Pro SKU | ID Protection not in external tenants                  | Limited                                            |
| Audit logs                      | CloudWatch / Plus event export                                                                   | 5-day retention Essentials; log stream on Essentials                  | 1 day Hobby / 7 day Pro / 30 day Business                      | Entra audit / sign-in logs                             | Auth audit 1 hour Free / 7 days Pro                |
| Webhooks / events               | EventBridge / Lambda triggers                                                                    | Event streams / Actions                                               | Webhooks                                                       | Event Grid / Graph notifications (verify at impl.)     | Auth hooks / webhooks                              |
| OAuth/OIDC security             | OIDC user pool + PKCE for public clients (standard)                                              | OIDC + PKCE documented                                                | OAuth/OIDC connections on Pro for enterprise SSO               | OIDC/SAML                                              | OAuth providers                                    |
| Provider posture                | AWS shared-responsibility; no DentalCare compliance claim                                        | Okta Trust; HIPAA/BAA Enterprise add-on only                          | SOC2 on Business; HIPAA on Business/Enterprise tables          | Microsoft platform                                     | SOC2/ISO on Team                                   |

**Preferred-provider residual security risks:**

- Cognito **Essentials** does not include Plus threat protection. If humans require adaptive/risk-based authentication before production admin go-live, budget Plus (USD 0.020/MAU, **no** 10k free tier) or accept Auth0 Professional.
- SMS MFA cost and SIM-swap residual risk: prefer TOTP/passkeys for privileged roles (policy in ADR-SEC-002).
- Application must still validate issuer, audience, expiry, signature, and **never** trust client `orgId` / role claims.

---

## 13. Multi-Tenant Analysis

Application model (authoritative):

```
Organization → Branch → Membership → Role → Permission
```

| Provider            | A. Native orgs/tenants                      | B. Clean integration with app-owned tenants                         | C. Forces vendor architecture?                         | Verdict                                      |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| **Cognito**         | No org product                              | Yes: `sub` → User → Membership                                      | No, if groups unused as RBAC                           | **Best fit**                                 |
| Auth0               | Yes (Organizations)                         | Yes **if** Organizations unused                                     | Gravity toward Auth0 Orgs/RBAC                         | Acceptable as IdP-only                       |
| Clerk               | Yes (Organizations, roles, permissions)     | Possible but fights official `auth.protect({ role })` path          | **Yes**, if used as documented                         | Poor fit                                     |
| Entra External ID   | Directory tenants / groups / app roles      | Possible as IdP-only                                                | Azure directory gravity; groups being added            | Acceptable but heavier                       |
| Supabase Auth       | Not DentalCare orgs; RLS policies per row   | Identity in another Postgres                                       | **Yes**, RLS-as-authorization product model            | Poor fit                                     |

**Rule after approval:** provider organization, group, role, permission, or RLS features are **non-authoritative**. They may be used only as opaque hints that the application re-validates against its own membership tables.

---

## 14. Next.js / API Analysis

Target stack (TDA-ADR-001 / M0): Next.js **15.5.x App Router**, React 19, route handlers under `apps/web`, no auth implementation yet.

| Concern                 | Cognito                                                                                          | Auth0                                                                 | Clerk                          | Entra                         | Supabase                      |
| ----------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------ | ----------------------------- | ----------------------------- |
| App Router              | Custom adapter + cookie/session or OIDC code flow                                                | Official SDK v4                                                       | Official SDK                   | MSAL / custom                 | `@supabase/ssr`               |
| SSR / Server Components | Verify JWT from httpOnly cookie / authorization header                                           | `auth0.getSession()`                                                  | `auth()`                       | Custom                        | Cookie session helpers        |
| Route handlers / API    | `aws-jwt-verify` or generic JWKS verify                                                          | `getSession` / `withApiAuthRequired`                                  | `auth.protect()`               | Bearer JWT validate           | `getUser()` / JWT             |
| Middleware / proxy      | Possible; must not put authorization SoT in middleware alone                                     | Required to mount `/auth/*` in SDK v4                                 | `clerkMiddleware` / proxy      | Custom                        | Session refresh middleware    |
| Client components       | No user/tenant/role from client as authority                                                     | `useUser` is UX only                                                  | `useAuth` is UX only           | UX only                       | UX only                       |
| Token verification      | Official JWKS documented                                                                         | JWKS                                                                  | Clerk JWT                     | Microsoft JWKS                | JWT secret / JWKS mix         |

**Implementation constraint (not done here):** the adapter may use a vendor SDK **after approval**, but authorization decisions must remain in application services. Middleware may gate “is authenticated”; it must not become the RBAC engine.

Cognito’s lower C2 score is accepted. A thin OIDC adapter is consistent with `AuthenticationPort` and **improves** replaceability versus a deep Clerk/Auth0 SDK.

---

## 15. Pricing Analysis

Official billing currencies are **USD** (Auth0, Clerk, Cognito, Supabase) and Azure meter currency (Entra; public overage **UNKNOWN**). **No INR conversion** is provided.

### Scale definitions (application MAU, not clinics)

| Scale        | Assumption                                      | Why it is meaningful                                      |
| ------------ | ----------------------------------------------- | --------------------------------------------------------- |
| **LOW**      | ≤ 1,000 MAU                                     | Early practices + staff + a small patient portal          |
| **MEDIUM**   | 5,000 MAU                                       | Several organizations, mixed staff/patient accounts       |
| **GROWTH**   | 10,000 MAU and 50,000 MAU (two checkpoints)     | Auth0 published tiers; Cognito free tier ends at 10k MAU  |

Figures below are **identity-provider list prices only**. They exclude DentalCare compute, Postgres, email/SMS at carrier rates (except where the IdP page states a number), support retainers, and taxes.

### LOW (1,000 MAU)

| Provider            | Production-capable MFA SKU                         | Approximate monthly list (USD)                                                                 | Notes |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----- |
| Cognito Essentials  | Essentials (default)                               | **0** (≤ 10,000 direct/social MAU free, indefinite)                                            | SMS/email extra via SNS/SES |
| Auth0 B2C Essentials| Essentials (MFA not on Free)                       | **70** (1,000 MAU tier)                                                                        | Free 25k MAU lacks Pro MFA |
| Clerk Pro           | Pro (MFA not on Hobby)                             | **25**                                                                                         | 50k MRU included |
| Entra External ID   | Basic                                              | **0** if ≤ 50k MAU                                                                             | Overage UNKNOWN |
| Supabase Auth       | Pro if production uptime/MFA policy needs Pro      | **25** + compute (Micro included in Pro credits) or Free **0** with pause risk                 | Phone MFA +75 if used |

### MEDIUM (5,000 MAU)

| Provider            | Approximate monthly list (USD)        |
| ------------------- | ------------------------------------- |
| Cognito Essentials  | **0**                                 |
| Auth0 B2C Essentials| **350**                               |
| Clerk Pro           | **25**                                |
| Entra External ID   | **0** (≤ 50k)                         |
| Supabase Pro        | **25** + compute                      |

### GROWTH

| Provider            | 10,000 MAU (USD)                         | 50,000 MAU (USD)                                      |
| ------------------- | ---------------------------------------- | ----------------------------------------------------- |
| Cognito Essentials  | **0** (free tier 10k)                    | **600** = (50,000 − 10,000) × 0.015                   |
| Cognito Plus        | 10,000 × 0.020 = **200** (no free tier)  | 50,000 × 0.020 = **1,000**                            |
| Auth0 B2C Essentials| **700**                                  | **3,500**                                             |
| Auth0 B2C Professional | **1,600**                             | Not listed / “Not available” at 50k on the published Professional table |
| Clerk Pro           | **25**                                   | **25** (50k included); next MRU USD 0.02              |
| Entra External ID   | **0**                                    | **0** at 50k; **UNKNOWN** above                       |
| Supabase Pro        | **25** + compute                         | **25** + compute (100k MAU included on Pro)           |

### Cost drivers that are easy to miss

- **SMS/OTP:** Cognito → SNS; Auth0 MFA SMS may require entitled factors; Clerk Pro SMS USD 0.01 US/Canada, international “market rate”; Entra SMS add-on; Supabase phone MFA add-on. India SMS unit prices: **UNKNOWN** here (carrier/SNS regional tables not frozen).
- **Organizations:** Auth0 B2B SKUs and Clerk B2B add-on must **not** be purchased to become the tenant database. If purchased accidentally, they still must not be SoT.
- **Custom domains:** Auth0 Free includes 1 (card verification). Clerk custom domain on Hobby. Cognito custom domain cost **UNKNOWN** on the MAU table. Supabase custom domain USD 10/domain/month/project on Pro.
- **Support / SLA:** Auth0 SLA 99.99% on Enterprise; Clerk 99.99% on Enterprise; Cognito AWS SLA is service-specific (not restated here).
- **Do not optimize for Free.** IAM-FR-004 MFA capability knocks Auth0 Free and Clerk Hobby out of production.

**Cost conclusion:** Cognito Essentials is the only evaluated MFA-capable managed IdP whose official MAU meter stays **USD 0** through MEDIUM and the 10k GROWTH checkpoint. Auth0 is materially more expensive at the same MAU. Clerk Pro is cheap at 50k MRU but fails the tenancy/lock-in criteria.

---

## 16. Privacy / Data Analysis

Patient **clinical** data must remain in the application PostgreSQL database under Prisma. IdP attributes are limited to authentication identity (subject, email, verification flags, MFA enrollment metadata). Do not stuff clinical records into user metadata because a vendor allows JSON attributes.

| Provider            | Where identity may be stored (official)                                                                                         | India-relevant option                                      | Deletion / export                                              | Contract notes (not legal advice) |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------- |
| **Cognito**         | User-pool Region only for profile data; some email/SMS/analytics features can egress                                            | **`ap-south-1` listed**                                    | Admin APIs; CSV import ≠ password import                       | AWS customer agreement / DPA path |
| Auth0               | Public Cloud: US, UK, EU, AU, JP, CA                                                                                            | **Not on Public Cloud.** Private Cloud AWS lists India     | Bulk export; hashes via support ticket                         | Okta DPA; HIPAA/BAA Enterprise add-on |
| Clerk               | Primarily Google Cloud + Cloudflare; processing may be worldwide including the US                                               | **No India region found**                                  | Dashboard export                                               | Clerk DPA / DPF for EU-US         |
| Entra External ID   | Microsoft cloud; Go-Local **Australia or Japan only**                                                                           | **Go-Local is not India**                                  | Microsoft data subject tools (directory)                       | Azure subscription                |
| Supabase Auth       | Project primary region; Mumbai listed                                                                                           | **`ap-south-1` listed**                                    | User data ownership claimed on pricing table                   | DPA; HIPAA Team add-on            |

**Subprocessors:** Clerk publishes a Trust Center list. Auth0/Okta Trust & Compliance lists subprocessors. AWS and Microsoft use published subprocessor lists. Exact current lists change; treat live Trust Center pages as the operational source after approval.

**DPDP / GDPR:** This ADR records **where data can be stored**, not a legal determination that a vendor makes DentalCare “compliant”. Human legal review remains an open decision.

---

## 17. Portability Analysis

| Concern                         | Cognito                                                                 | Auth0                                                      | Clerk                                      | Entra                         | Supabase                      |
| ------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ | ----------------------------- | ----------------------------- |
| Identity export                 | ListUsers / AdminGetUser / CSV tools                                    | Bulk export JSON/CSV                                       | Dashboard export                           | Graph / directory export      | Auth schema / admin API       |
| Password migration **out**      | Hashes not simply portable; users typically reset or use a migration design | Hashes **not** in bulk export; support ticket              | **UNKNOWN**                                | **UNKNOWN** / directory tools | **UNKNOWN**                   |
| Password migration **in**       | Migration Lambda / USER_PASSWORD auth documented                        | Custom DB / import                                         | Migration guide; Enterprise assistance     | B2C migration playbooks       | Import users                  |
| App user mapping                | `sub` → User.identitySubject                                            | `sub` → User                                               | `userId` → User                            | `oid`/`sub` → User            | `id` → User                   |
| OIDC portability                | **High** (standard user-pool OIDC)                                      | High protocol, SDK-shaped app code                         | Lower (session SDK)                        | High protocol                 | Lower (project JWT)           |
| Proprietary SDK dependence      | Avoidable (prefer JWKS verify)                                          | Official Next.js SDK is convenient but wrap it             | High                                       | MSAL                          | `@supabase/ssr`               |
| Proprietary org/RBAC            | Avoid groups-as-RBAC                                                    | Avoid Organizations-as-SoT                                 | High gravity                               | Avoid app-roles-as-SoT        | Avoid RLS-as-SoT              |

**Portability rule:** replacing the IdP must not require rewriting application authorization. That is why the preferred provider is the one that least wants to own Organization/Role/Permission.

---

## 18. Recommendation

**Select Amazon Cognito user pools, Essentials plan, as the managed identity provider.**

Use it as an OIDC issuer only:

```
Cognito user pool
   → Authentication adapter (OIDC/JWKS)
     → AuthenticationPort
       → Application User
         → Membership
           → Authorization
             → Domain
```

**Why this is the evidence-based choice (not DX):**

1. Matches TDA-ADR-002: authentication vs authorization split; no vendor tenant database required.
2. Official MFA and passkey capability on Essentials (IAM-FR-004 capability).
3. Official Next.js/API path exists via JWT verification libraries AWS documents for Node.js, without forcing Amplify.
4. Official identity-data region includes `ap-south-1` (primary market India).
5. Official MAU pricing remains USD 0 through 10,000 direct/social MAU, then USD 0.015/MAU — sustainable versus Auth0 B2C Essentials at USD 350 (5k) / USD 700 (10k) / USD 3,500 (50k).
6. Highest weighted score (7.60) under the required model.

**Required configuration decisions at implementation time (not this ADR):**

- Feature plan: **Essentials** (not Lite, because passkeys/email MFA live on Essentials+).
- Region: **ap-south-1** unless the hosting ADR places production in a different AWS Region and humans explicitly colocate identity there.
- App clients: confidential server client for the Next.js server; PKCE for browser.
- MFA: enable TOTP and/or passkeys for privileged roles per ADR-SEC-002; do not default privileged users to SMS-only.
- Attributes stored in Cognito: subject, email, email_verified, phone only if required later; **no clinical fields**.

---

## 19. Second Choice

**Auth0 B2C Essentials**, IdP-only.

Use if humans reject AWS/Cognito (procurement, skills, or multi-cloud policy) **and** accept that Public Cloud identity data will **not** reside in India unless Private Cloud (Enterprise) is purchased.

Must still:

- Map `sub` → application User
- Ignore Auth0 Organizations / Auth0 RBAC as authorization SoT
- Sit behind `AuthenticationPort`
- Enable Pro MFA (not Free)

Auth0 scores 7.55 — a close second — on security and Next.js SDK quality.

---

## 20. Rejected Options

| Option                    | Outcome            | Why |
| ------------------------- | ------------------ | --- |
| Clerk                     | Less suitable      | Official org/RBAC helpers conflict with ADR-002 if used as designed; Hobby lacks MFA; US-primary hosting; high SDK lock-in. Strong DX is not sufficient. |
| Microsoft Entra External ID | Less suitable    | Public overage price **UNKNOWN**; Go-Local is Australia/Japan only; Azure subscription coupling; ID Protection unavailable in external tenants; Next.js integration is not first-class. |
| Supabase Auth             | Less suitable      | Product model pushes RLS as authorization; identity in a second Postgres; JWT coupling; would compete with the approved Prisma application database. |
| Auth0 as **first** choice | Not preferred      | Public Cloud has no India region; MAU cost scales poorly; Organizations gravity. Retained as second choice. |
| Custom password tables    | Already rejected   | TDA-ADR-002 / TDA-IMP-M0-002 / TDA-SEC-001 |
| Social-login-only         | Already rejected   | TDA-ADR-002 |
| Self-hosted Keycloak      | Not evaluated      | Not a managed provider; ops burden not in M0/M1 scope |

---

## 21. Fallback Strategy

The application **must** retain the M0/M1 authentication abstraction.

| Trigger                                         | Action |
| ----------------------------------------------- | ------ |
| Cognito becomes too expensive (e.g. Plus + SMS) | Stay on Essentials + TOTP/passkeys; if still unacceptable, switch adapter to Auth0 B2C Essentials without rewriting RBAC |
| AWS pricing change                              | Re-score C6; if Auth0 or Entra is then cheaper **and** still IdP-only capable, replace adapter only |
| Cognito unavailable / regional outage           | AWS published multi-Region replication (Jun 2026) as Essentials/Plus add-on including Mumbai — evaluate as operations ADR; short-term: fail closed (no auth bypass) |
| Operational failure (misconfig, lockouts)       | Break-glass SYSTEM_ADMIN runbook (human-owned); never a backdoor in app code |
| Unsuitable for privacy/residency                | If India identity residency is forbidden on AWS, move to Auth0 Private Cloud (Enterprise, cost **UNKNOWN**) or Entra **only if** Go-Local/India story is later officially extended; otherwise STOP and reopen this ADR |
| Vendor lock-in pressure                         | Adapter already OIDC/JWKS; export users; force password reset on cutover if hashes cannot be migrated |

**Non-negotiable during any fallback:** Patient clinical data never moves into the IdP. Application Membership/RBAC tables remain authoritative.

---

## 22. Implementation Boundary

Conceptual (do **not** implement in this task):

```
Provider (Cognito user pool)
   ↓
Authentication Adapter (OIDC code flow, JWKS verification, session cookie)
   ↓
AuthenticationPort
   ↓
Application Identity (User mapped by provider subject)
   ↓
Membership
   ↓
Authorization (roles/permissions/BOLA/tenant scope)
   ↓
Domain
```

M0 already defines `AuthenticationPort` in `packages/domain/src/foundation/auth-port.ts` with `providerId: "unset" | "managed"`. After **human approval**, M1 may introduce a Cognito/OIDC adapter that sets `providerId` to `"managed"` (or a more specific id if the port is extended by an approved change). Until approval: no SDK, no callbacks, no secrets, no Prisma identity tables in *this* task.

---

## 23. Risks

| ID | Risk                                                                                          | Mitigation |
| -- | --------------------------------------------------------------------------------------------- | ---------- |
| R1 | Cognito Next.js integration is not turnkey; poor adapter design could leak tokens             | Thin adapter; httpOnly cookies; JWKS verify; security review before production |
| R2 | Teams may use Cognito groups as RBAC to “save a table”                                        | Forbidden by this ADR and TDA-ADR-002 |
| R3 | SMS MFA cost and SIM-swap                                                                     | Prefer TOTP/passkeys for admin; ADR-SEC-002 |
| R4 | Plus threat-protection not included on Essentials                                             | Accept residual risk or budget Plus; do not claim adaptive MFA is on Essentials |
| R5 | Email/SMS/Pinpoint may leave `ap-south-1`                                                     | Configure SES/SNS in-region; avoid Pinpoint US routing unless accepted |
| R6 | Auth0 second choice has no Public Cloud India                                                 | Documented; do not silently switch to Auth0 Public Cloud for “India residency” |
| R7 | Entra overage price UNKNOWN                                                                   | Do not adopt Entra until unit price is verified in the Azure calculator for this tenant |
| R8 | REVIEW-status BRD/FRS/SEC                                                                     | Human approval required; this ADR is PROPOSED |
| R9 | Password hashes are not portable across vendors                                               | Plan forced reset on IdP change; keep emails verified in-app |
| R10| Amplify adoption would increase lock-in                                                       | Amplify not required; discourage as default |

---

## 24. Consequences

After **human approval**:

- M1 may implement an OIDC adapter for Amazon Cognito behind `AuthenticationPort`.
- M1 may persist Foundation identity tables (User, Organization, Branch, Membership, Role, Permission, session metadata, audit) per TDA-ADR-002 / DDD — **still no Patient/Appointment/Notification business tables**.
- `package.json` may gain JWT/OIDC verification libraries **only in the M1 implementation task**, not in this ADR.
- Auth0, Clerk, Entra, and Supabase Auth are not to be added as parallel production IdPs.
- Introducing a custom password IdP remains a C3 change.

Until approval:

- Provider remains `unset`.
- No vendor SDK.
- No login UI.

---

## 25. Open Decisions

| Decision                                           | Owner |
| -------------------------------------------------- | ----- |
| Human approval of TDA-ADR-001 / 002 / 003          | Architect, security, product owner |
| Exact production AWS Region if not `ap-south-1`    | Hosting ADR (TDA-ADR-001 open list) + this ADR |
| MFA factors and which roles require them           | ADR-SEC-002 |
| Cognito Plus vs Essentials for threat protection   | Security review before admin production |
| Hosted UI custom domain and SES/SNS accounts       | Operations |
| Session absolute/idle timeouts                     | Security review (numbers not invented here) |
| Legal DPDP/GDPR assessment of identity in AWS Mumbai | Counsel; not this ADR |
| Whether Auth0 Private Cloud is ever funded         | Procurement (only if Cognito rejected) |
| Entra overage USD/MAU once calculator access exists | Finance; currently UNKNOWN |
| Worker/M2M credentials for future internal APIs    | Later; Cognito M2M tokens have **no** free tier |

---

## 26. Approval Requirements

| Role                        | Action |
| --------------------------- | ------ |
| Architect / Technical Owner | Approve Cognito Essentials as IdP-only |
| Security reviewer           | Confirm MFA capability, JWKS validation, tenant isolation still in-app |
| Privacy / legal (human)     | Accept identity PII in AWS `ap-south-1` (or name another region) |
| Product owner               | Confirm staff/practitioner/patient accounts all use this one user pool (with application roles) |
| Cursor                      | Must not self-approve; must not implement authentication in this task |

---

## 27. Official Sources

Accessed **14 August 2026**. Third-party blogs are not used as price or capability evidence.

### Auth0

- https://auth0.com/pricing
- https://auth0.com/docs/quickstart/webapp/nextjs
- https://auth0.github.io/nextjs-auth0/
- https://auth0.com/docs/secure/multi-factor-authentication
- https://auth0.com/docs/troubleshoot/customer-support/operational-policies/data-export-and-transfer-policy
- https://auth0.com/platform/cloud-deployment
- https://auth0.com/docs/deploy-monitor/deploy-private-cloud/private-cloud-on-aws
- https://auth0.com/blog/auth0-plans-got-an-upgrade/

### Clerk

- https://clerk.com/pricing
- https://clerk.com/docs/reference/nextjs/app-router/auth
- https://clerk.com/docs/nextjs/guides/secure/protect-content
- https://clerk.com/docs/nextjs/guides/organizations/control-access/check-access
- https://clerk.com/legal/dpa
- https://clerk.com/legal/privacy
- https://clerk.com/legal/subprocessors

### Amazon Cognito

- https://aws.amazon.com/cognito/pricing/
- https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html
- https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html
- https://docs.aws.amazon.com/cognito/latest/developerguide/security-cognito-regional-data-considerations.html
- https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-using-import-tool.html
- https://docs.aws.amazon.com/general/latest/gr/cognito.html
- https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_WebAuthnConfigurationType.html
- https://github.com/awslabs/aws-jwt-verify
- https://aws.amazon.com/about-aws/whats-new/2026/06/amazon-cognito-multi-region/
- https://docs.amplify.aws/gen1/nextjs/build-a-backend/server-side-rendering/nextjs/ (optional path; not required)

### Microsoft Entra External ID

- https://www.microsoft.com/en-us/security/pricing/microsoft-entra-external-id
- https://azure.microsoft.com/en-in/pricing/details/microsoft-entra-external-id/
- https://learn.microsoft.com/en-us/entra/external-id/external-identities-pricing
- https://learn.microsoft.com/en-us/entra/external-id/customers/faq-customers
- https://learn.microsoft.com/en-us/entra/external-id/customers/concept-supported-features-customers

### Supabase Auth

- https://supabase.com/pricing
- https://supabase.com/docs/guides/auth/server-side/nextjs
- https://supabase.com/docs/guides/platform/regions
- https://supabase.com/auth

### DentalCare governing documents (repository)

- TDA-GOV-SOT-001, TDA-GOV-CUR-001, TDA-GOV-CMP-001
- TDA-ADR-001, TDA-ADR-002
- TDA-IMP-M0-002, TDA-IMP-M1-001, TDA-CURSOR-EXEC-001
- TDA-SEC-001, TDA-FRS-001 (IAM-FR-\*), TDA-API-001, TDA-DDD-001-D01
- M0 `AuthenticationPort` in `packages/domain/src/foundation/auth-port.ts`

---

## 28. Change History

| Version | Date           | Change                                      |
| ------- | -------------- | ------------------------------------------- |
| 1.0     | 14 August 2026 | Initial proposed provider selection         |
