import { loadConfig } from "@dentalcare/config";
import { PatientApplicationService } from "@dentalcare/application";
import { createPrismaClient, PrismaPatientRepository } from "@dentalcare/db";
import { getAuthorizationPort } from "../authz/port";

let service: PatientApplicationService | undefined;

export function getPatientService(): PatientApplicationService {
  if (service) {
    return service;
  }
  loadConfig();
  service = new PatientApplicationService(
    getAuthorizationPort(),
    new PrismaPatientRepository(createPrismaClient()),
  );
  return service;
}
