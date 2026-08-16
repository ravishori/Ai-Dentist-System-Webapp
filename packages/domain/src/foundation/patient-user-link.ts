/**
 * Explicit Patient ↔ User link within one organization (TDA-ADR-004 §3.3).
 * No silent email/phone matching.
 */
export interface PatientUserLink {
  readonly id: string;
  readonly organizationId: string;
  readonly patientId: string;
  readonly userId: string;
  readonly linkedAt: string;
  readonly linkedByUserId?: string;
}
