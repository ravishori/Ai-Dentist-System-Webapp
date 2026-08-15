import type { Patient } from "@dentalcare/domain";
import { isValidPatientEmail } from "../patient/validation.js";

export type EligibilityFailure =
  | "inactive_patient"
  | "missing_email"
  | "invalid_email"
  | "consent_missing"
  | "opted_out";

export type EligibilityResult =
  | { readonly ok: true; readonly email: string }
  | { readonly ok: false; readonly code: EligibilityFailure };

export function evaluateRecipientEligibility(patient: Patient | null): EligibilityResult {
  if (!patient) {
    return { ok: false, code: "inactive_patient" };
  }
  if (patient.status !== "active") {
    return { ok: false, code: "inactive_patient" };
  }
  const email = patient.email?.trim().toLowerCase();
  if (!email) {
    return { ok: false, code: "missing_email" };
  }
  if (!isValidPatientEmail(email)) {
    return { ok: false, code: "invalid_email" };
  }
  if (!patient.appointmentNotificationConsent) {
    return { ok: false, code: "consent_missing" };
  }
  if (patient.appointmentNotificationOptOut) {
    return { ok: false, code: "opted_out" };
  }
  return { ok: true, email };
}
