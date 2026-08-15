import { loadConfig } from "@dentalcare/config";
import { NotificationApplicationService } from "@dentalcare/application";
import { createPrismaClient, PrismaNotificationOutboxRepository } from "@dentalcare/db";
import { getAuthorizationPort } from "../authz/port";

let service: NotificationApplicationService | undefined;

export function getNotificationService(): NotificationApplicationService {
  if (service) {
    return service;
  }
  loadConfig();
  service = new NotificationApplicationService(
    getAuthorizationPort(),
    new PrismaNotificationOutboxRepository(createPrismaClient()),
  );
  return service;
}
