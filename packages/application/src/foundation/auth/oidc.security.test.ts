import { SignJWT, createLocalJWKSet } from "jose";
import { describe, expect, it } from "vitest";
import { AUTH_LOGIN_COOKIE, AUTH_SESSION_COOKIE, AuthenticationError } from "@dentalcare/domain";
import { handleCallbackGet, handleLoginGet, handleLogoutPost, handleSessionGet } from "./http.js";
import { verifyIdToken } from "./id-token.js";
import { parseDiscoveryDocument } from "./oidc-discovery.js";
import { mapProviderIdentity } from "./identity-mapping.js";
import { UnsetAuthenticationPort } from "./unset-adapter.js";
import { CognitoOidcAuthenticationAdapter } from "./cognito-oidc-adapter.js";
import { InMemoryUserIdentityDirectory } from "./in-memory-stores.js";
import { beginLogin, CLIENT_ID, createHarness, ISSUER, REDIRECT_URI } from "./test-harness.js";

describe("OIDC discovery", () => {
  it("W. rejects a malformed discovery document", () => {
    expect(() => parseDiscoveryDocument("{", ISSUER, "test")).toThrow(AuthenticationError);
    expect(() => parseDiscoveryDocument({ issuer: ISSUER }, ISSUER, "test")).toThrow(
      AuthenticationError,
    );
  });

  it("rejects discovery issuer mismatch / issuer confusion", () => {
    expect(() =>
      parseDiscoveryDocument(
        {
          issuer: "https://attacker.example",
          authorization_endpoint: "https://attacker.example/authorize",
          token_endpoint: "https://attacker.example/token",
          jwks_uri: "https://attacker.example/jwks",
        },
        ISSUER,
        "test",
      ),
    ).toThrow(AuthenticationError);
  });

  it("rejects non-HTTPS discovery endpoints outside test", () => {
    expect(() =>
      parseDiscoveryDocument(
        {
          issuer: ISSUER,
          authorization_endpoint: "http://example.com/authorize",
          token_endpoint: "https://example.com/token",
          jwks_uri: "https://example.com/jwks",
        },
        ISSUER,
        "production",
      ),
    ).toThrow(AuthenticationError);
  });
});

describe("Cognito OIDC adapter", () => {
  it("A. successful login maps issuer+subject and sets an HttpOnly session cookie", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    expect(login.url.searchParams.get("response_type")).toBe("code");
    expect(login.url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(login.url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(login.started.cookies[0]?.httpOnly).toBe(true);

    harness.tokenBody = {
      id_token: await harness.signIdToken({ nonce: login.nonce, sub: "subject-1" }),
      access_token: "must-not-leak",
      refresh_token: "must-not-leak",
    };
    const completed = await harness.adapter.completeLogin({
      code: "good-code",
      state: login.state,
      loginCookie: login.loginCookie,
    });
    expect(completed.identity.subject).toBe("subject-1");
    expect(completed.identity.issuer).toBe(ISSUER);
    expect(completed.identity.userId).toMatch(/^user_/);
    expect(completed.cookies.some((cookie) => cookie.name === AUTH_SESSION_COOKIE)).toBe(true);
    expect(JSON.stringify(completed)).not.toContain("must-not-leak");
    expect(JSON.stringify(completed)).not.toContain("id_token");
  });

  it("B/C. invalid or missing state is rejected", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    harness.tokenBody = { id_token: await harness.signIdToken({ nonce: login.nonce }) };
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: "attacker-state",
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_state" });
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("D. replayed state cannot create a second session", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    harness.tokenBody = { id_token: await harness.signIdToken({ nonce: login.nonce }) };
    await harness.adapter.completeLogin({
      code: "good-code",
      state: login.state,
      loginCookie: login.loginCookie,
    });
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: login.state,
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("E. invalid nonce is rejected", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    harness.tokenBody = { id_token: await harness.signIdToken({ nonce: "other-nonce" }) };
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: login.state,
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_nonce" });
  });

  it("F. replayed nonce/login transaction is rejected", async () => {
    const harness = await createHarness();
    const first = await beginLogin(harness);
    harness.tokenBody = { id_token: await harness.signIdToken({ nonce: first.nonce }) };
    await harness.adapter.completeLogin({
      code: "good-code",
      state: first.state,
      loginCookie: first.loginCookie,
    });
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: first.state,
        loginCookie: first.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("G/H. invalid or rejected authorization code does not create a session", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    harness.tokenStatus = 400;
    await expect(
      harness.adapter.completeLogin({
        code: "bad-or-expired-code",
        state: login.state,
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_token" });
    const session = await harness.adapter.readSession({ sessionCookie: "missing" });
    expect(session).toBeNull();
  });

  it("I/J. invalid signature is rejected", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    const token = await harness.signIdToken({ nonce: login.nonce });
    const damaged = `${token.slice(0, -4)}abcd`;
    harness.tokenBody = { id_token: damaged };
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: login.state,
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("K. wrong issuer is rejected", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    const token = await new SignJWT({
      token_use: "id",
      nonce: login.nonce,
    })
      .setProtectedHeader({ alg: "RS256", kid: harness.kid })
      .setIssuer("https://attacker.example")
      .setAudience(CLIENT_ID)
      .setSubject("subject-1")
      .setIssuedAt(Math.floor(harness.nowMs / 1000))
      .setExpirationTime(Math.floor(harness.nowMs / 1000) + 300)
      .sign(harness.privateKey);
    harness.tokenBody = { id_token: token };
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: login.state,
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("L. wrong audience is rejected", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    const token = await new SignJWT({ token_use: "id", nonce: login.nonce })
      .setProtectedHeader({ alg: "RS256", kid: harness.kid })
      .setIssuer(ISSUER)
      .setAudience("other-client")
      .setSubject("subject-1")
      .setIssuedAt(Math.floor(harness.nowMs / 1000))
      .setExpirationTime(Math.floor(harness.nowMs / 1000) + 300)
      .sign(harness.privateKey);
    harness.tokenBody = { id_token: token };
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: login.state,
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("M. expired ID token is rejected even with clock skew", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    const exp = Math.floor(harness.nowMs / 1000) - 120;
    const token = await new SignJWT({ token_use: "id", nonce: login.nonce })
      .setProtectedHeader({ alg: "RS256", kid: harness.kid })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setSubject("subject-1")
      .setIssuedAt(exp - 60)
      .setExpirationTime(exp)
      .sign(harness.privateKey);
    harness.tokenBody = { id_token: token };
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: login.state,
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("N. unknown signing key is rejected", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    const other = await (await import("jose")).generateKeyPair("RS256");
    const token = await new SignJWT({ token_use: "id", nonce: login.nonce })
      .setProtectedHeader({ alg: "RS256", kid: "other-kid" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setSubject("subject-1")
      .setIssuedAt(Math.floor(harness.nowMs / 1000))
      .setExpirationTime(Math.floor(harness.nowMs / 1000) + 300)
      .sign(other.privateKey);
    harness.tokenBody = { id_token: token };
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: login.state,
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("O. JWT algorithm confusion (HS256) is rejected", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    const token = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(
        JSON.stringify({
          token_use: "id",
          nonce: login.nonce,
          sub: "subject-1",
          iss: ISSUER,
          aud: CLIENT_ID,
          iat: Math.floor(harness.nowMs / 1000),
          exp: Math.floor(harness.nowMs / 1000) + 300,
        }),
      ).toString("base64url"),
      Buffer.from("not-a-real-signature").toString("base64url"),
    ].join(".");
    harness.tokenBody = { id_token: token };
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: login.state,
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("P/Q. existing user is reused; email change does not change identity key", async () => {
    const harness = await createHarness();
    const first = await beginLogin(harness);
    harness.tokenBody = {
      id_token: await harness.signIdToken({
        nonce: first.nonce,
        sub: "stable-sub",
        email: "one@example.test",
      }),
    };
    const created = await harness.adapter.completeLogin({
      code: "first-code",
      state: first.state,
      loginCookie: first.loginCookie,
    });
    const second = await beginLogin(harness);
    harness.tokenBody = {
      id_token: await harness.signIdToken({
        nonce: second.nonce,
        sub: "stable-sub",
        email: "two@example.test",
      }),
    };
    const reused = await harness.adapter.completeLogin({
      code: "second-code",
      state: second.state,
      loginCookie: second.loginCookie,
    });
    expect(reused.identity.userId).toBe(created.identity.userId);
    expect(reused.identity.email).toBe("two@example.test");
    expect(reused.identity.subject).toBe("stable-sub");
  });

  it("R. unknown subject is provisioned as a new application user", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    harness.tokenBody = {
      id_token: await harness.signIdToken({ nonce: login.nonce, sub: "new-sub" }),
    };
    const completed = await harness.adapter.completeLogin({
      code: "good-code",
      state: login.state,
      loginCookie: login.loginCookie,
    });
    expect(completed.identity.userId).toBeTruthy();
    expect(await harness.directory.findByIssuerSubject(ISSUER, "new-sub")).not.toBeNull();
  });

  it("S/T. logout revokes the application session", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    harness.tokenBody = { id_token: await harness.signIdToken({ nonce: login.nonce }) };
    const completed = await harness.adapter.completeLogin({
      code: "good-code",
      state: login.state,
      loginCookie: login.loginCookie,
    });
    const sessionCookie = completed.cookies.find(
      (cookie) => cookie.name === AUTH_SESSION_COOKIE,
    )?.value;
    expect(await harness.adapter.readSession({ sessionCookie })).not.toBeNull();
    const logout = await harness.adapter.logout({ sessionCookie });
    expect(logout.cookies.every((cookie) => cookie.cleared)).toBe(true);
    expect(await harness.adapter.readSession({ sessionCookie })).toBeNull();
  });

  it("U. unset provider cannot start login", async () => {
    const unset = new UnsetAuthenticationPort();
    await expect(unset.startLogin()).rejects.toMatchObject({ code: "not_configured" });
  });

  it("V. provider outage is mapped to a safe error", async () => {
    const harness = await createHarness();
    harness.failDiscovery = true;
    await expect(harness.adapter.startLogin()).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });

  it("X. malformed JWKS material cannot authenticate", async () => {
    const empty = createLocalJWKSet({ keys: [] });
    const harness = await createHarness();
    const broken = new CognitoOidcAuthenticationAdapter({
      config: harness.config,
      identityDirectory: harness.directory,
      sessions: harness.sessions,
      loginTransactions: harness.transactions,
      fetchImpl: async (input) => {
        if (String(input).includes("openid-configuration")) {
          return Response.json(harness.discovery);
        }
        return Response.json(harness.tokenBody);
      },
      jwks: empty,
      now: () => new Date(harness.nowMs),
    });
    const started = await broken.startLogin();
    const url = new URL(started.authorizationUrl);
    harness.tokenBody = {
      id_token: await harness.signIdToken({ nonce: url.searchParams.get("nonce") ?? "" }),
    };
    await expect(
      broken.completeLogin({
        code: "good-code",
        state: url.searchParams.get("state") ?? "",
        loginCookie: started.cookies[0]?.value,
      }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("Y. client-supplied redirect_uri is ignored/rejected by HTTP handler", async () => {
    const harness = await createHarness();
    const result = await handleCallbackGet(harness.adapter, {
      code: "good-code",
      state: "state",
      redirectUri: "https://attacker.example/steal",
      successRedirect: "http://localhost:3000/",
    });
    expect(result.status).toBe(400);
    expect(JSON.stringify(result)).not.toContain("attacker.example/steal");
  });

  it("Z. HTTP handlers never emit tokens or secrets", async () => {
    const harness = await createHarness();
    const loginHttp = await handleLoginGet(harness.adapter);
    expect(loginHttp.status).toBe(302);
    expect(JSON.stringify(loginHttp.body ?? {})).not.toMatch(/id_token|access_token|refresh_token/);
    const login = await beginLogin(harness);
    harness.tokenBody = {
      id_token: await harness.signIdToken({ nonce: login.nonce }),
      access_token: "leak",
      refresh_token: "leak",
    };
    const callback = await handleCallbackGet(harness.adapter, {
      code: "good-code",
      state: login.state,
      loginCookie: login.loginCookie,
      successRedirect: "http://localhost:3000/",
    });
    expect(callback.status).toBe(302);
    expect(JSON.stringify(callback)).not.toContain("leak");
    expect(callback.headers.location).toBe("http://localhost:3000/");
    const sessionCookie = callback.cookies.find(
      (cookie) => cookie.name === AUTH_SESSION_COOKIE,
    )?.value;
    const session = await handleSessionGet(harness.adapter, { sessionCookie });
    expect(session.status).toBe(200);
    expect(JSON.stringify(session.body)).not.toContain("leak");
    const logout = await handleLogoutPost(harness.adapter, {
      sessionCookie,
      fallbackRedirect: "http://localhost:3000/",
    });
    expect(logout.status).toBe(302);
    const reused = await handleSessionGet(harness.adapter, { sessionCookie });
    expect(reused.status).toBe(401);
  });

  it("rejects access-token token_use in an ID token", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    harness.tokenBody = {
      id_token: await harness.signIdToken({ nonce: login.nonce, token_use: "access" }),
    };
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: login.state,
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("does not reuse a pre-auth cookie as the session (session fixation)", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    harness.tokenBody = { id_token: await harness.signIdToken({ nonce: login.nonce }) };
    const completed = await harness.adapter.completeLogin({
      code: "good-code",
      state: login.state,
      loginCookie: login.loginCookie,
    });
    const sessionCookie = completed.cookies.find(
      (cookie) => cookie.name === AUTH_SESSION_COOKIE,
    )?.value;
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie).not.toBe(login.loginCookie);
    expect(completed.cookies.find((cookie) => cookie.name === AUTH_LOGIN_COOKIE)?.cleared).toBe(
      true,
    );
  });

  it("disabled users cannot authenticate", async () => {
    const harness = await createHarness();
    await harness.directory.provisionFromClaims({
      issuer: ISSUER,
      subject: "disabled-sub",
      email: "disabled@example.test",
    });
    harness.directory.disable(ISSUER, "disabled-sub");
    const login = await beginLogin(harness);
    harness.tokenBody = {
      id_token: await harness.signIdToken({ nonce: login.nonce, sub: "disabled-sub" }),
    };
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: login.state,
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "account_disabled" });
  });

  it("rejects expired login state", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    harness.nowMs += 601_000;
    harness.tokenBody = { id_token: await harness.signIdToken({ nonce: login.nonce }) };
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: login.state,
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("rejects a missing nonce claim", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    const token = await new SignJWT({ token_use: "id" })
      .setProtectedHeader({ alg: "RS256", kid: harness.kid })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setSubject("subject-1")
      .setIssuedAt(Math.floor(harness.nowMs / 1000))
      .setExpirationTime(Math.floor(harness.nowMs / 1000) + 300)
      .sign(harness.privateKey);
    harness.tokenBody = { id_token: token };
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: login.state,
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_nonce" });
  });

  it("rejects a replayed authorization code on a new login", async () => {
    const harness = await createHarness();
    const first = await beginLogin(harness);
    harness.tokenBody = { id_token: await harness.signIdToken({ nonce: first.nonce }) };
    await harness.adapter.completeLogin({
      code: "replay-code",
      state: first.state,
      loginCookie: first.loginCookie,
    });
    const second = await beginLogin(harness);
    harness.tokenBody = { id_token: await harness.signIdToken({ nonce: second.nonce }) };
    await expect(
      harness.adapter.completeLogin({
        code: "replay-code",
        state: second.state,
        loginCookie: second.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rejects JWKS poisoning via jku", async () => {
    const harness = await createHarness();
    const login = await beginLogin(harness);
    const token = await new SignJWT({ token_use: "id", nonce: login.nonce })
      .setProtectedHeader({
        alg: "RS256",
        kid: harness.kid,
        jku: "https://attacker.example/jwks.json",
      })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setSubject("subject-1")
      .setIssuedAt(Math.floor(harness.nowMs / 1000))
      .setExpirationTime(Math.floor(harness.nowMs / 1000) + 300)
      .sign(harness.privateKey);
    harness.tokenBody = { id_token: token };
    await expect(
      harness.adapter.completeLogin({
        code: "good-code",
        state: login.state,
        loginCookie: login.loginCookie,
      }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });
});

describe("identity mapping", () => {
  it("does not use email as the identity key", async () => {
    const directory = new InMemoryUserIdentityDirectory();
    const first = await mapProviderIdentity(directory, {
      issuer: ISSUER,
      subject: "sub-a",
      email: "same@example.test",
    });
    const second = await mapProviderIdentity(directory, {
      issuer: ISSUER,
      subject: "sub-b",
      email: "same@example.test",
    });
    expect(first.userId).not.toBe(second.userId);
  });
});

describe("ID token helper", () => {
  it("rejects none algorithm headers", async () => {
    const harness = await createHarness();
    const token = [
      Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
      Buffer.from(
        JSON.stringify({
          sub: "x",
          iss: ISSUER,
          aud: CLIENT_ID,
          nonce: "n",
          token_use: "id",
          iat: Math.floor(harness.nowMs / 1000),
          exp: Math.floor(harness.nowMs / 1000) + 300,
        }),
      ).toString("base64url"),
      "",
    ].join(".");
    await expect(
      verifyIdToken({
        idToken: token,
        jwks: createLocalJWKSet({ keys: [harness.publicJwk] }),
        config: harness.config,
        nonce: "n",
        now: () => new Date(harness.nowMs),
      }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });
});

describe("HTTP login CSRF", () => {
  it("callback without login cookie fails closed", async () => {
    const harness = await createHarness();
    const result = await handleCallbackGet(harness.adapter, {
      code: "good-code",
      state: "state",
      successRedirect: "http://localhost:3000/",
    });
    expect(result.status).toBe(400);
  });
});
