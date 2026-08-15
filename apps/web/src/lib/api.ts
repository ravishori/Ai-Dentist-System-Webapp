export type ApiErrorBody = {
  error?: string;
  message?: string;
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? body.error ?? `Request failed (${status})`);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

export function getStoredOrganizationId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem("dentalcare.organizationId") ?? "";
}

export function setStoredOrganizationId(value: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem("dentalcare.organizationId", value.trim());
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { organizationId?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const organizationId = init.organizationId ?? getStoredOrganizationId();
  if (organizationId) {
    headers.set("x-organization-id", organizationId);
  }
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = (isJson ? await response.json() : {}) as ApiErrorBody & T;

  if (!response.ok) {
    throw new ApiRequestError(response.status, body);
  }
  return body as T;
}

export type SessionResponse = {
  userId?: string;
  subject?: string;
  issuer?: string;
  emailVerified?: boolean;
  authenticatedAt?: string;
};

export type AuthCapability = {
  session: SessionResponse | null;
  authenticated: boolean;
  authConfigured: boolean | null;
  authMessage: string | null;
};

export async function loadAuthCapability(): Promise<AuthCapability> {
  let session: SessionResponse | null = null;
  let authenticated = false;
  try {
    session = await apiFetch<SessionResponse>("/api/auth/session");
    authenticated = Boolean(session.userId);
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 401) {
      throw error;
    }
  }

  let authConfigured: boolean | null = null;
  let authMessage: string | null = null;
  try {
    const loginResponse = await fetch("/api/auth/login", {
      method: "GET",
      redirect: "manual",
      credentials: "same-origin",
    });
    if (loginResponse.status === 503) {
      authConfigured = false;
      const body = (await loginResponse.json().catch(() => ({}))) as ApiErrorBody;
      authMessage = body.message ?? "Authentication provider is not configured.";
    } else if (loginResponse.status === 302 || loginResponse.status === 0) {
      // 0 can occur for opaque redirects in some browsers.
      authConfigured = true;
    } else if (loginResponse.ok) {
      authConfigured = true;
    } else {
      authConfigured = null;
      authMessage = `Login probe returned HTTP ${loginResponse.status}.`;
    }
  } catch {
    authConfigured = null;
    authMessage = "Unable to probe authentication configuration.";
  }

  return { session, authenticated, authConfigured, authMessage };
}
