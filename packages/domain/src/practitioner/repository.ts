import type { Appointment } from "../appointment/appointment.js";
import type {
  Practitioner,
  PractitionerBranchAssignment,
  PractitionerCreateInput,
  PractitionerCreateScheduleInput,
  PractitionerReplaceScheduleInput,
  PractitionerSchedule,
  PractitionerUnavailability,
  PractitionerUnavailabilityCreateInput,
  PractitionerUpdateInput,
} from "./practitioner.js";
import type { PractitionerHistoryEvent } from "./history.js";

export interface PractitionerWriteContext {
  readonly organizationId: string;
  readonly actorUserId: string;
}

/** Appointment-facing practitioner lookups (M4 + M7-07 assignment/active checks). */
export interface PractitionerRepository {
  create(organizationId: string, userId: string): Promise<Practitioner>;
  findByOrganizationAndId(
    organizationId: string,
    practitionerId: string,
  ): Promise<Practitioner | null>;
  isAssignedToBranch(
    organizationId: string,
    practitionerId: string,
    branchId: string,
  ): Promise<boolean>;
}

export interface PractitionerManagementRepository extends PractitionerRepository {
  findByUserId(userId: string): Promise<Practitioner | null>;
  listByOrganization(organizationId: string): Promise<readonly Practitioner[]>;
  updateByOrganizationAndId(
    context: PractitionerWriteContext,
    practitionerId: string,
    input: PractitionerUpdateInput,
  ): Promise<Practitioner>;
  deactivateByOrganizationAndId(
    context: PractitionerWriteContext,
    practitionerId: string,
  ): Promise<Practitioner>;
  activateByOrganizationAndId(
    context: PractitionerWriteContext,
    practitionerId: string,
  ): Promise<Practitioner>;
  createWithAudit(
    context: PractitionerWriteContext,
    input: PractitionerCreateInput,
  ): Promise<Practitioner>;
  setVerificationStatus(
    context: PractitionerWriteContext,
    practitionerId: string,
    verificationStatus: import("./practitioner.js").PractitionerVerificationStatus,
  ): Promise<Practitioner>;
  assignBranch(
    context: PractitionerWriteContext,
    practitionerId: string,
    branchId: string,
  ): Promise<PractitionerBranchAssignment>;
  unassignBranch(
    context: PractitionerWriteContext,
    practitionerId: string,
    branchId: string,
  ): Promise<void>;
  listAssignments(
    organizationId: string,
    practitionerId: string,
  ): Promise<readonly PractitionerBranchAssignment[]>;
  createSchedule(
    context: PractitionerWriteContext,
    practitionerId: string,
    input: PractitionerCreateScheduleInput,
  ): Promise<PractitionerSchedule>;
  replaceSchedule(
    context: PractitionerWriteContext,
    practitionerId: string,
    scheduleId: string,
    input: PractitionerReplaceScheduleInput,
  ): Promise<PractitionerSchedule>;
  findScheduleByOrganizationAndId(
    organizationId: string,
    practitionerId: string,
    scheduleId: string,
  ): Promise<PractitionerSchedule | null>;
  findScheduleByPractitionerAndBranch(
    organizationId: string,
    practitionerId: string,
    branchId: string,
  ): Promise<PractitionerSchedule | null>;
  listSchedules(
    organizationId: string,
    practitionerId: string,
  ): Promise<readonly PractitionerSchedule[]>;
  createUnavailability(
    context: PractitionerWriteContext,
    practitionerId: string,
    input: PractitionerUnavailabilityCreateInput,
  ): Promise<PractitionerUnavailability>;
  cancelUnavailability(
    context: PractitionerWriteContext,
    practitionerId: string,
    intervalId: string,
  ): Promise<PractitionerUnavailability>;
  listUnavailability(
    organizationId: string,
    practitionerId: string,
  ): Promise<readonly PractitionerUnavailability[]>;
  listHistory(
    organizationId: string,
    practitionerId: string,
  ): Promise<readonly { eventType: PractitionerHistoryEvent; actorUserId: string }[]>;
}

export type PractitionerAppointmentLookup = {
  listByOrganization(
    organizationId: string,
    filter?: { practitionerId?: string },
  ): Promise<readonly Appointment[]>;
};
