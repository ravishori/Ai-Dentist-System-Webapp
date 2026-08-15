import { loadConfig } from "@dentalcare/config";
import { PractitionerApplicationService } from "@dentalcare/application";
import {
  createPrismaClient,
  PrismaAppointmentRepository,
  PrismaAuthorizationDirectory,
  PrismaBranchLookup,
  PrismaPractitionerRepository,
} from "@dentalcare/db";
import { getAuthorizationPort } from "../authz/port";

let service: PractitionerApplicationService | undefined;

export function getPractitionerService(): PractitionerApplicationService {
  if (service) {
    return service;
  }
  loadConfig();
  const prisma = createPrismaClient();
  service = new PractitionerApplicationService(
    getAuthorizationPort(),
    new PrismaAuthorizationDirectory(prisma),
    new PrismaPractitionerRepository(prisma),
    new PrismaBranchLookup(prisma),
    new PrismaAppointmentRepository(prisma),
  );
  return service;
}
