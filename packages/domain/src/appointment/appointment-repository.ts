import type { Appointment, AppointmentCreateInput, AppointmentListFilter } from "./appointment.js";
import type { Practitioner } from "./practitioner.js";
import type { BranchRecord } from "./branch-record.js";

export interface AppointmentWriteContext {
  readonly organizationId: string;
  readonly actorUserId: string;
}

export interface AppointmentRepository {
  create(context: AppointmentWriteContext, input: AppointmentCreateInput): Promise<Appointment>;
  findByOrganizationAndId(organizationId: string, appointmentId: string): Promise<Appointment | null>;
  listByOrganization(
    organizationId: string,
    filter?: AppointmentListFilter,
  ): Promise<readonly Appointment[]>;
  rescheduleByOrganizationAndId(
    context: AppointmentWriteContext,
    appointmentId: string,
    startAtUtc: string,
    endAtUtc: string,
    timezone: string,
  ): Promise<Appointment>;
  cancelByOrganizationAndId(
    context: AppointmentWriteContext,
    appointmentId: string,
  ): Promise<Appointment>;
}

export interface PractitionerRepository {
  create(organizationId: string, userId: string): Promise<Practitioner>;
  findByOrganizationAndId(
    organizationId: string,
    practitionerId: string,
  ): Promise<Practitioner | null>;
}

export interface BranchLookup {
  findByOrganizationAndId(organizationId: string, branchId: string): Promise<BranchRecord | null>;
}
