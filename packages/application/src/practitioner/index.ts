/** Practitioner application services. M7 implements profile, assignment, and advisory availability. */
export const PRACTITIONER_APPLICATION = "practitioner" as const;

export {
  PractitionerApplicationService,
  toPublicPractitioner,
  toPublicAssignment,
  toPublicSchedule,
  toPublicUnavailability,
  toPublicAvailability,
} from "./service.js";
export type { PractitionerHttpResult } from "./http.js";
export {
  handlePractitionerCreate,
  handlePractitionerList,
  handlePractitionerGet,
  handlePractitionerUpdate,
  handlePractitionerDeactivate,
  handlePractitionerActivate,
  handlePractitionerAssignBranch,
  handlePractitionerUnassignBranch,
  handlePractitionerCreateSchedule,
  handlePractitionerReplaceSchedule,
  handlePractitionerCreateUnavailability,
  handlePractitionerCancelUnavailability,
  handlePractitionerAvailability,
} from "./http.js";
export { InMemoryPractitionerRepository } from "./in-memory-repository.js";
export {
  parseCreateInput,
  parseUpdateInput,
  parseAssignInput,
  parseScheduleInput,
  parseReplaceScheduleInput,
  parseUnavailabilityInput,
  parseAvailabilityQuery,
  parseCommandBody,
} from "./validation.js";
