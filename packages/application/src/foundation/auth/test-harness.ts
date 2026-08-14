import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  createLocalJWKSet,
  type JWK,
  type KeyLike,
} from "jose";
import { CognitoOidcAuthenticationAdapter } from "./cognito-oidc-adapter.js";
import {
  InMemoryLoginTransactionStore,
  InMemorySessionStore,
  InMemoryUserIdentityDirectory,
} from "./in-memory-stores.js";
import type { OidcRuntimeConfig } from "./types.js";

export const ISSUER = "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_testpool";
export const CLIENT_ID = "test-client-id";
export const REDIRECT_URI = "http://localhost:3000/api/auth/callback";

export interface OidcHarness {
  adapter: CognitoOidcAuthenticationAdapter;
  directory: InMemoryUserIdentityDirectory;
  sessions: InMemorySessionStore;
  transactions: InMemoryLoginTransactionStore;
  config: OidcRuntimeConfig;
  nowMs: number;
  privateKey: KeyLike;
  publicJwk: JWK;
  kid: string;
  discovery: Record<string, unknown>;
  tokenStatus: number;
  tokenBody: Record<string, unknown> | string;
  failDiscovery: boolean;
  malformedDiscovery: boolean;
  malformedJwksHttp: boolean;
  usedAuthorizationCodes: Set<string>;
  signIdToken: (
    claims?: Record<string, unknown>,
    header?: Record<string, unknown>,
  ) => Promise<string>;
}

export async function createHarness(): Promise<OidcHarness> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const kid = "test-kid-1";
  publicJwk.kid = kid;
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  const jwks = createLocalJWKSet({ keys: [publicJwk] });

  const config: OidcRuntimeConfig = {
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: "server-side-secret",
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: "http://localhost:3000/",
    sessionSecret: "test-session-secret-which-is-32b-min",
    sessionTtlSeconds: 3_600,
    clockSkewSeconds: 60,
    cookieSecure: false,
    nodeEnv: "test",
  };

  const harness: OidcHarness = {
    adapter: undefined as unknown as CognitoOidcAuthenticationAdapter,
    directory: new InMemoryUserIdentityDirectory(),
    sessions: new InMemorySessionStore(),
    transactions: new InMemoryLoginTransactionStore(),
    config,
    nowMs: Date.parse("2026-08-14T12:00:00.000Z"),
    privateKey,
    publicJwk,
    kid,
    discovery: {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth2/authorize`,
      token_endpoint: `${ISSUER}/oauth2/token`,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      userinfo_endpoint: `${ISSUER}/oauth2/userInfo`,
      end_session_endpoint: `${ISSUER}/logout`,
      id_token_signing_alg_values_supported: ["RS256"],
    },
    tokenStatus: 200,
    tokenBody: {},
    failDiscovery: false,
    malformedDiscovery: false,
    malformedJwksHttp: false,
    usedAuthorizationCodes: new Set<string>(),
    async signIdToken(claims = {}, header = {}) {
      const jwt = new SignJWT({
        token_use: "id",
        email: "user@example.test",
        email_verified: true,
        name: "Test User",
        nonce: "replace-me",
        ...claims,
      })
        .setProtectedHeader({ alg: "RS256", kid, ...header })
        .setIssuer(ISSUER)
        .setAudience(CLIENT_ID)
        .setSubject(typeof claims.sub === "string" ? claims.sub : "subject-1")
        .setIssuedAt(Math.floor(harness.nowMs / 1000))
        .setExpirationTime(Math.floor(harness.nowMs / 1000) + 300);
      return jwt.sign(privateKey);
    },
  };

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (harness.failDiscovery) {
      throw new Error("network down");
    }
    if (url.endsWith("/.well-known/openid-configuration")) {
      if (harness.malformedDiscovery) {
        return new Response("{not-json", { status: 200 });
      }
      return Response.json(harness.discovery);
    }
    if (url.endsWith("/.well-known/jwks.json")) {
      if (harness.malformedJwksHttp) {
        return new Response("{not-json", { status: 200 });
      }
      return Response.json({ keys: [publicJwk] });
    }
    if (init?.method === "POST") {
      const body = String(init.body ?? "");
      const code = new URLSearchParams(body).get("code") ?? "";
      if (code && harness.usedAuthorizationCodes.has(code)) {
        return new Response("replayed_code", { status: 400 });
      }
      if (code) {
        harness.usedAuthorizationCodes.add(code);
      }
      if (harness.tokenStatus !== 200) {
        return new Response("error", { status: harness.tokenStatus });
      }
      if (typeof harness.tokenBody === "string") {
        return new Response(harness.tokenBody, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return Response.json(harness.tokenBody);
    }
    return new Response("not found", { status: 404 });
  };

  harness.adapter = new CognitoOidcAuthenticationAdapter({
    config,
    identityDirectory: harness.directory,
    sessions: harness.sessions,
    loginTransactions: harness.transactions,
    fetchImpl,
    jwks,
    now: () => new Date(harness.nowMs),
  });

  return harness;
}

export async function beginLogin(harness: OidcHarness) {
  const started = await harness.adapter.startLogin();
  const url = new URL(started.authorizationUrl);
  const loginCookie = started.cookies.find((cookie) => cookie.name === "dc_login")?.value;
  if (!loginCookie) {
    throw new Error("missing login cookie");
  }
  return {
    started,
    url,
    state: url.searchParams.get("state") ?? "",
    nonce: url.searchParams.get("nonce") ?? "",
    loginCookie,
  };
}
