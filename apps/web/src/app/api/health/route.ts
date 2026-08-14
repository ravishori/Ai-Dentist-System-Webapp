import { loadConfig } from "@dentalcare/config";
import type { HealthResponse } from "@dentalcare/contracts";

export const dynamic = "force-dynamic";

export function GET(): Response {
  loadConfig();

  const body: HealthResponse = {
    status: "ok",
    service: "web",
    timestamp: new Date().toISOString(),
    milestone: "M0",
  };

  return Response.json(body);
}
