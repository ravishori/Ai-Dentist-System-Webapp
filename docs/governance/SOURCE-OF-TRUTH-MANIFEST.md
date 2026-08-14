# DentalCare AI — Source-of-Truth Manifest

Version: 1.0
Status: REVIEW / BASELINE INVENTORY
Date: 2026-08-14

Implementation must use the highest-authority approved document available. Conflicts are STOP conditions (TDA-GOV-SOT-001).

REVIEW documents are provisional and must not be treated as final. DECISION BASELINE / Controlled Baseline documents govern current M0 work where no APPROVED successor exists.

| Document ID         | Document                                        | Version | Status                                                            | Authority                       |
| ------------------- | ----------------------------------------------- | ------- | ----------------------------------------------------------------- | ------------------------------- |
| TDA-GOV-SOT-001     | Source-of-Truth Policy                          | 1.0     | Controlled Baseline                                               | Governance                      |
| TDA-GOV-CUR-001     | Cursor Project Rules                            | 1.0     | Referenced; installed as `.cursor/rules/00-dentalcare-master.mdc` | Governance                      |
| TDA-GOV-CMP-001     | Change Management Policy                        | 1.0     | REVIEW                                                            | Governance                      |
| TDA-GOV-RTM-001     | Requirements Traceability Matrix                | 1.0     | REVIEW                                                            | Governance                      |
| TDA-GOV-AUD-001     | Volumes 1–4 Documentation Audit                 | 1.0     | REVIEW                                                            | Governance                      |
| TDA-PRD-BRD-001     | BRD (Volume 01)                                 | 1.1     | REVIEW                                                            | Product                         |
| TDA-FRS-001         | FRS (Volume 02)                                 | 1.1     | REVIEW                                                            | Product                         |
| TDA-TDD-001         | TDD (Volume 03)                                 | 1.1     | REVIEW                                                            | Architecture                    |
| TDA-DDD-001-D01     | DDD Domain 01 Foundation & Identity             | 1.1     | REVIEW                                                            | Database                        |
| TDA-CADG-001        | Cursor AI Development & Governance              | 1.0     | Controlled Draft                                                  | Governance                      |
| TDA-API-001         | API Architecture & Standards                    | 1.0     | REVIEW                                                            | API                             |
| TDA-API-PAT-001     | Patient API Specification                       | 1.0     | REVIEW                                                            | API                             |
| TDA-API-APT-001     | Appointment API Specification                   | 1.0     | REVIEW                                                            | API                             |
| TDA-API-NOTIF-001   | Notification API & Worker Specification         | 1.0     | REVIEW                                                            | API                             |
| TDA-DOM-PAT-001     | Patient Domain Specification                    | 1.0     | REVIEW                                                            | Domain                          |
| TDA-DOM-APT-001     | Appointment Domain Specification                | 1.0     | REVIEW                                                            | Domain                          |
| TDA-DOM-NOTIF-001   | Notification Domain Specification               | 1.0     | REVIEW                                                            | Domain                          |
| TDA-DDD-PAT-001     | Patient Database Design                         | 1.0     | REVIEW                                                            | Database                        |
| TDA-DDD-APT-001     | Appointment Database Design                     | 1.0     | REVIEW                                                            | Database                        |
| TDA-DDD-NOTIF-001   | Notification Database Design                    | 1.0     | REVIEW                                                            | Database                        |
| TDA-SEC-001         | Security & Privacy Architecture                 | 1.0     | REVIEW                                                            | Security                        |
| TDA-QA-001          | Quality Assurance & Test Strategy               | 1.0     | REVIEW                                                            | QA                              |
| TDA-IMP-001         | Cursor Implementation & Delivery Plan           | 1.0     | REVIEW                                                            | Implementation                  |
| TDA-IMP-M0-001      | Repository & Tooling Baseline                   | 1.0     | READY FOR EXECUTION                                               | Implementation                  |
| TDA-IMP-M0-002      | Repository Baseline & Technology Stack Decision | 1.0     | DECISION BASELINE                                                 | Implementation / ADR-equivalent |
| TDA-CURSOR-EXEC-001 | Cursor Master Execution Pack                    | 1.0     | READY FOR CONTROLLED USE                                          | Implementation                  |
| TDA-IMP-M1-001      | Foundation & Identity Implementation Plan       | 1.0     | READY FOR EXECUTION                                               | Implementation                  |
| TDA-IMP-M2-001      | Patient Domain Implementation Plan              | 1.0     | REVIEW                                                            | Implementation                  |
| TDA-IMP-M3-001      | Appointment Domain Implementation Plan          | 1.0     | REVIEW                                                            | Implementation                  |
| TDA-IMP-M4-001      | Notification Implementation Plan                | 1.0     | REVIEW                                                            | Implementation                  |
| TDA-IMP-M5-001      | Security Hardening Implementation Plan          | 1.0     | REVIEW                                                            | Implementation                  |
| TDA-IMP-M6-001      | E2E and Operations Implementation Plan          | 1.0     | REVIEW                                                            | Implementation                  |
| TDA-IMP-M7-001      | Production Readiness Implementation Plan        | 1.0     | REVIEW                                                            | Implementation                  |

## Recorded stack reconciliation (M0)

TDA-TDD-001 v1.1 (REVIEW) prefers FastAPI/Python + Celery-or-equivalent workers and optional Redis.

TDA-IMP-M0-002 v1.0 (DECISION BASELINE) selects Next.js + TypeScript + Node worker + Prisma + PostgreSQL transactional outbox, with no Redis/broker in M0.

Authority determination for this web-application repository: TDA-IMP-M0-002 governs M0 because it is the decision baseline for this conversion, TDD is REVIEW (provisional), TDD defers worker/queue selection to an ADR, and both documents agree PostgreSQL is the system of record.

Human reconciliation of TDD v1.1 against M0-002 is required before TDD is approved/baselined. See `docs/adr/ADR-M0-001-typescript-modular-monolith.md`.
