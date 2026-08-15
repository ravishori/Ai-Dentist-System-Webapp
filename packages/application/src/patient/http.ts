import type { AuthenticatedIdentity } from "@dentalcare/domain";
import { PatientValidationError } from "@dentalcare/domain";
import { toPublicPatient, type PatientApplicationService } from "./service.js";
import { parseCreateInput, parseUpdateInput } from "./validation.js";

export interface PatientHttpResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

const JSON_HEADERS = { "content-type": "application/json" };

export async function handlePatientCreate(
  service: PatientApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    body: Record<string, unknown>;
  },
): Promise<PatientHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    const parsed = parseCreateInput(input.body);
    const result = await service.create(input.identity, input.organizationId, parsed);
    return toHttpResult(result, (patient) => ({ patient: toPublicPatient(patient) }));
  } catch (error) {
    return validationError(error);
  }
}

export async function handlePatientList(
  service: PatientApplicationService,
  input: { identity: AuthenticatedIdentity | null; organizationId?: string },
): Promise<PatientHttpResult> {
  const result = await service.list(input.identity, input.organizationId);
  return toHttpResult(result, (patients) => ({ patients: patients.map(toPublicPatient) }));
}

export async function handlePatientGet(
  service: PatientApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    patientId?: string;
  },
): Promise<PatientHttpResult> {
  const result = await service.get(input.identity, input.organizationId, input.patientId);
  return toHttpResult(result, (patient) => ({ patient: toPublicPatient(patient) }));
}

export async function handlePatientPatch(
  service: PatientApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    patientId?: string;
    body: Record<string, unknown>;
  },
): Promise<PatientHttpResult> {
  if (!input.identity) {
    return unauthenticated();
  }
  try {
    const parsed = parseUpdateInput(input.body);
    const result = await service.update(
      input.identity,
      input.organizationId,
      input.patientId,
      parsed,
    );
    return toHttpResult(result, (patient) => ({ patient: toPublicPatient(patient) }));
  } catch (error) {
    return validationError(error);
  }
}

function toHttpResult<T>(
  result:
    | { ok: true; status: 200 | 201; data: T }
    | { ok: false; status: number; error: string; message: string },
  map: (data: T) => Record<string, unknown>,
): PatientHttpResult {
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

function unauthenticated(): PatientHttpResult {
  return {
    status: 401,
    headers: JSON_HEADERS,
    body: { error: "unauthenticated", message: "Authentication required." },
  };
}

function validationError(error: unknown): PatientHttpResult {
  if (error instanceof PatientValidationError) {
    return {
      status: 400,
      headers: JSON_HEADERS,
      body: { error: "invalid_input", message: "Patient input was invalid." },
    };
  }
  throw error;
}
