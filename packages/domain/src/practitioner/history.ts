export const PRACTITIONER_HISTORY_EVENTS = [
  "created",
  "updated",
  "deactivated",
  "activated",
  "assigned",
  "unassigned",
  "schedule_replaced",
  "unavailability_created",
  "unavailability_cancelled",
] as const;

export type PractitionerHistoryEvent = (typeof PRACTITIONER_HISTORY_EVENTS)[number];

export interface PractitionerHistoryRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly practitionerId: string;
  readonly eventType: PractitionerHistoryEvent;
  readonly actorUserId: string;
  readonly createdAt: string;
}

export const PRACTITIONER_AUDIT_ACTIONS = [
  "practitioner.create",
  "practitioner.update",
  "practitioner.deactivate",
  "practitioner.activate",
  "practitioner.assignment.assign",
  "practitioner.assignment.unassign",
  "practitioner.schedule.replace",
  "practitioner.leave.create",
  "practitioner.leave.cancel",
] as const;

export type PractitionerAuditAction = (typeof PRACTITIONER_AUDIT_ACTIONS)[number];
