import { loadConfig } from "@dentalcare/config";
import { AppointmentApplicationService } from "@dentalcare/application";
import {
  createPrismaClient,
  PrismaAppointmentRepository,
  PrismaBranchLookup,
  PrismaPatientRepository,
  PrismaPractitionerRepository,
} from "@dentalcare/db";
import { getAuthorizationPort } from "../authz/port";

let service: AppointmentApplicationService | undefined;

export function getAppointmentService(): AppointmentApplicationService {
  if (service) {
    return service;
  }
  loadConfig();
  const prisma = createPrismaClient();
  service = new AppointmentApplicationService(
    getAuthorizationPort(),
    new PrismaAppointmentRepository(prisma),
    new PrismaPatientRepository(prisma),
    new PrismaPractitionerRepository(prisma),
    new PrismaBranchLookup(prisma),
  );
  return service;
}
