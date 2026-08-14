export {
  FOUNDATION_BOUNDARY,
  unsetAuthentication,
  type AuthenticationPort,
  type AuthProviderId,
} from "./foundation/index.js";
export { PATIENT_BOUNDARY } from "./patient/index.js";
export { APPOINTMENT_BOUNDARY } from "./appointment/index.js";
export { NOTIFICATION_BOUNDARY } from "./notification/index.js";

export const DOMAIN_BOUNDARIES = ["foundation", "patient", "appointment", "notification"] as const;

export type DomainBoundary = (typeof DOMAIN_BOUNDARIES)[number];
