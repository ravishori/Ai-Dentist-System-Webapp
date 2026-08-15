export type HealthStatus = "ok" | "degraded";

export interface HealthResponse {
  status: HealthStatus;
  service: "web" | "worker";
  timestamp: string;
  milestone: "M0" | "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7";
}

export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;
