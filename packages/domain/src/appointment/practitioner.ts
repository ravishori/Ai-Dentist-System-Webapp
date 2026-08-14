/**
 * Minimum Practitioner Profile for Appointment (M4-01).
 * Linked to an Application User. Not a Cognito subject.
 */
export interface Practitioner {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
