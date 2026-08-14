import { AuthenticationError } from "@dentalcare/domain";
import type { OidcDiscoveryDocument, OidcRuntimeConfig } from "./types.js";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return undefined;
  }
  return value as string[];
}

function isUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function assertHttpsUnlessTest(url: string, nodeEnv: OidcRuntimeConfig["nodeEnv"]): void {
  const parsed = new URL(url);
  if (parsed.protocol === "https:") {
    return;
  }
  if (nodeEnv === "test" && parsed.protocol === "http:") {
    return;
  }
  throw new AuthenticationError("provider_unavailable", "insecure_discovery_url");
}

export function parseDiscoveryDocument(
  raw: unknown,
  expectedIssuer: string,
  nodeEnv: OidcRuntimeConfig["nodeEnv"],
): OidcDiscoveryDocument {
  if (!raw || typeof raw !== "object") {
    throw new AuthenticationError("provider_unavailable", "malformed_discovery_document");
  }
  const record = raw as Record<string, unknown>;
  const issuer = readString(record.issuer);
  const authorizationEndpoint = readString(record.authorization_endpoint);
  const tokenEndpoint = readString(record.token_endpoint);
  const jwksUri = readString(record.jwks_uri);
  if (!issuer || !authorizationEndpoint || !tokenEndpoint || !jwksUri) {
    throw new AuthenticationError("provider_unavailable", "malformed_discovery_document");
  }
  if (![issuer, authorizationEndpoint, tokenEndpoint, jwksUri].every(isUrl)) {
    throw new AuthenticationError("provider_unavailable", "malformed_discovery_document");
  }
  if (issuer !== expectedIssuer) {
    throw new AuthenticationError("invalid_token", "discovery_issuer_mismatch");
  }
  assertHttpsUnlessTest(authorizationEndpoint, nodeEnv);
  assertHttpsUnlessTest(tokenEndpoint, nodeEnv);
  assertHttpsUnlessTest(jwksUri, nodeEnv);
  const userinfo = readString(record.userinfo_endpoint);
  const endSession = readString(record.end_session_endpoint);
  if (userinfo) {
    if (!isUrl(userinfo)) {
      throw new AuthenticationError("provider_unavailable", "malformed_discovery_document");
    }
    assertHttpsUnlessTest(userinfo, nodeEnv);
  }
  if (endSession) {
    if (!isUrl(endSession)) {
      throw new AuthenticationError("provider_unavailable", "malformed_discovery_document");
    }
    assertHttpsUnlessTest(endSession, nodeEnv);
  }
  return {
    issuer,
    authorization_endpoint: authorizationEndpoint,
    token_endpoint: tokenEndpoint,
    jwks_uri: jwksUri,
    userinfo_endpoint: userinfo,
    end_session_endpoint: endSession,
    id_token_signing_alg_values_supported: readStringArray(
      record.id_token_signing_alg_values_supported,
    ),
  };
}

export class OidcDiscoveryClient {
  private cached: { document: OidcDiscoveryDocument; fetchedAtMs: number } | null = null;
  private readonly ttlMs = 5 * 60 * 1000;

  constructor(
    private readonly config: Pick<OidcRuntimeConfig, "issuer" | "nodeEnv">,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  invalidate(): void {
    this.cached = null;
  }

  async load(): Promise<OidcDiscoveryDocument> {
    if (this.cached && this.now() - this.cached.fetchedAtMs < this.ttlMs) {
      return this.cached.document;
    }
    const issuer = this.config.issuer.replace(/\/+$/, "");
    const url = `${issuer}/.well-known/openid-configuration`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, { method: "GET", redirect: "error" });
    } catch {
      throw new AuthenticationError("provider_unavailable", "discovery_fetch_failed");
    }
    if (!response.ok) {
      throw new AuthenticationError("provider_unavailable", "discovery_http_error");
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new AuthenticationError("provider_unavailable", "malformed_discovery_document");
    }
    const document = parseDiscoveryDocument(json, this.config.issuer, this.config.nodeEnv);
    this.cached = { document, fetchedAtMs: this.now() };
    return document;
  }
}
