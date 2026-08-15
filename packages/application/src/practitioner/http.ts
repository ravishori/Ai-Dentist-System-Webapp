import type { AuthenticatedIdentity } from "@dentalcare/domain";
import { PractitionerValidationError } from "@dentalcare/domain";
import {
  PractitionerApplicationService,
  toPublicAssignment,
  toPublicAvailability,
  toPublicPractitioner,
  toPublicSchedule,
  toPublicUnavailability,
} from "./service.js";
import {
  parseAssignInput,
  parseAvailabilityQuery,
  parseCommandBody,
  parseCreateInput,
  parseReplaceScheduleInput,
  parseScheduleInput,
  parseUnavailabilityInput,
  parseUpdateInput,
} from "./validation.js";

export interface PractitionerHttpResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

const JSON_HEADERS = { "content-type": "application/json" };

export async function handlePractitionerCreate(
  service: PractitionerApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    body: Record<string, unknown>;
  },
): Promise<PractitionerHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    const parsed = parseCreateInput(input.body);
    const result = await service.create(input.identity, input.organizationId, parsed);
    return toHttpResult(result, (data) => ({
      practitioner: toPublicPractitioner(data.practitioner),
      assignments: data.assignments.map(toPublicAssignment),
    }));
  } catch (error) {
    return validationError(error);
  }
}

export async function handlePractitionerList(
  service: PractitionerApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
  },
): Promise<PractitionerHttpResult> {
  const result = await service.list(input.identity, input.organizationId);
  return toHttpResult(result, (views) => ({
    practitioners: views.map((view) => ({
      practitioner: toPublicPractitioner(view.practitioner),
      assignments: view.assignments.map(toPublicAssignment),
    })),
  }));
}

export async function handlePractitionerGet(
  service: PractitionerApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    practitionerId?: string;
  },
): Promise<PractitionerHttpResult> {
  const result = await service.get(input.identity, input.organizationId, input.practitionerId);
  return toHttpResult(result, (data) => ({
    practitioner: toPublicPractitioner(data.practitioner),
    assignments: data.assignments.map(toPublicAssignment),
  }));
}

export async function handlePractitionerUpdate(
  service: PractitionerApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    practitionerId?: string;
    body: Record<string, unknown>;
  },
): Promise<PractitionerHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    const parsed = parseUpdateInput(input.body);
    const result = await service.update(
      input.identity,
      input.organizationId,
      input.practitionerId,
      parsed,
    );
    return toHttpResult(result, (data) => ({
      practitioner: toPublicPractitioner(data.practitioner),
      assignments: data.assignments.map(toPublicAssignment),
    }));
  } catch (error) {
    return validationError(error);
  }
}

export async function handlePractitionerDeactivate(
  service: PractitionerApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    practitionerId?: string;
    body?: Record<string, unknown>;
  },
): Promise<PractitionerHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    parseCommandBody(input.body ?? {});
  } catch (error) {
    return validationError(error);
  }
  const result = await service.deactivate(
    input.identity,
    input.organizationId,
    input.practitionerId,
  );
  return toHttpResult(result, (data) => ({
    practitioner: toPublicPractitioner(data.practitioner),
    assignments: data.assignments.map(toPublicAssignment),
    conflicts: data.conflicts,
  }));
}

export async function handlePractitionerActivate(
  service: PractitionerApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    practitionerId?: string;
    body?: Record<string, unknown>;
  },
): Promise<PractitionerHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    parseCommandBody(input.body ?? {});
  } catch (error) {
    return validationError(error);
  }
  const result = await service.activate(input.identity, input.organizationId, input.practitionerId);
  return toHttpResult(result, (data) => ({
    practitioner: toPublicPractitioner(data.practitioner),
    assignments: data.assignments.map(toPublicAssignment),
  }));
}

export async function handlePractitionerAssignBranch(
  service: PractitionerApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    practitionerId?: string;
    body: Record<string, unknown>;
  },
): Promise<PractitionerHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    const parsed = parseAssignInput(input.body);
    const result = await service.assignBranch(
      input.identity,
      input.organizationId,
      input.practitionerId,
      parsed.branchId,
    );
    return toHttpResult(result, (data) => ({
      practitioner: toPublicPractitioner(data.practitioner),
      assignments: data.assignments.map(toPublicAssignment),
    }));
  } catch (error) {
    return validationError(error);
  }
}

export async function handlePractitionerUnassignBranch(
  service: PractitionerApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    practitionerId?: string;
    branchId?: string;
    body?: Record<string, unknown>;
  },
): Promise<PractitionerHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    parseCommandBody(input.body ?? {});
  } catch (error) {
    return validationError(error);
  }
  const result = await service.unassignBranch(
    input.identity,
    input.organizationId,
    input.practitionerId,
    input.branchId,
  );
  return toHttpResult(result, (data) => ({
    practitioner: toPublicPractitioner(data.practitioner),
    assignments: data.assignments.map(toPublicAssignment),
    conflicts: data.conflicts,
  }));
}

export async function handlePractitionerCreateSchedule(
  service: PractitionerApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    practitionerId?: string;
    body: Record<string, unknown>;
  },
): Promise<PractitionerHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    const parsed = parseScheduleInput(input.body);
    const result = await service.createSchedule(
      input.identity,
      input.organizationId,
      input.practitionerId,
      parsed,
    );
    return toHttpResult(result, (schedule) => ({ schedule: toPublicSchedule(schedule) }));
  } catch (error) {
    return validationError(error);
  }
}

export async function handlePractitionerReplaceSchedule(
  service: PractitionerApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    practitionerId?: string;
    scheduleId?: string;
    body: Record<string, unknown>;
  },
): Promise<PractitionerHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    const parsed = parseReplaceScheduleInput(input.body);
    const result = await service.replaceSchedule(
      input.identity,
      input.organizationId,
      input.practitionerId,
      input.scheduleId,
      parsed,
    );
    return toHttpResult(result, (schedule) => ({ schedule: toPublicSchedule(schedule) }));
  } catch (error) {
    return validationError(error);
  }
}

export async function handlePractitionerCreateUnavailability(
  service: PractitionerApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    practitionerId?: string;
    body: Record<string, unknown>;
  },
): Promise<PractitionerHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    const parsed = parseUnavailabilityInput(input.body);
    const result = await service.createUnavailability(
      input.identity,
      input.organizationId,
      input.practitionerId,
      parsed,
    );
    return toHttpResult(result, (data) => ({
      unavailability: toPublicUnavailability(data.unavailability),
      conflicts: data.conflicts,
    }));
  } catch (error) {
    return validationError(error);
  }
}

export async function handlePractitionerCancelUnavailability(
  service: PractitionerApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    practitionerId?: string;
    intervalId?: string;
    body?: Record<string, unknown>;
  },
): Promise<PractitionerHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    parseCommandBody(input.body ?? {});
  } catch (error) {
    return validationError(error);
  }
  const result = await service.cancelUnavailability(
    input.identity,
    input.organizationId,
    input.practitionerId,
    input.intervalId,
  );
  return toHttpResult(result, (record) => ({ unavailability: toPublicUnavailability(record) }));
}

export async function handlePractitionerAvailability(
  service: PractitionerApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    practitionerId?: string;
    query: URLSearchParams;
  },
): Promise<PractitionerHttpResult> {
  try {
    const parsed = parseAvailabilityQuery(input.query);
    const result = await service.availability(
      input.identity,
      input.organizationId,
      input.practitionerId,
      parsed,
    );
    return toHttpResult(result, (availability) => ({
      availability: toPublicAvailability(availability),
    }));
  } catch (error) {
    return validationError(error);
  }
}

function toHttpResult<T>(
  result:
    | { ok: true; status: 200 | 201; data: T }
    | { ok: false; status: number; error: string; message: string },
  map: (data: T) => Record<string, unknown>,
): PractitionerHttpResult {
  if (!result.ok) {
    return {
      status: result.status,
      headers: JSON_HEADERS,
      body: { error: result.error, message: result.message },
    };
  }
  return {
    status: result.status,
    headers: JSON_HEADERS,
    body: map(result.data),
  };
}

function unauthenticated(): PractitionerHttpResult {
  return {
    status: 401,
    headers: JSON_HEADERS,
    body: { error: "unauthenticated", message: "Authentication required." },
  };
}

function validationError(error: unknown): PractitionerHttpResult {
  if (error instanceof PractitionerValidationError) {
    return {
      status: 400,
      headers: JSON_HEADERS,
      body: { error: "invalid_input", message: "Practitioner input was invalid." },
    };
  }
  throw error;
}
