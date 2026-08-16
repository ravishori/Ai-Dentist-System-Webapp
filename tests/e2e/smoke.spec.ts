import { expect, test } from "@playwright/test";

test("landing page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DentalCare AI" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register as patient" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register as dentist" })).toBeVisible();
});

test("login page loads passwordless form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send verification code" })).toBeVisible();
  await expect(page.getByLabel(/^email$|^mobile number$/i)).toBeVisible();
});

test("patient registration page loads", async ({ page }) => {
  await page.goto("/register/patient");
  await expect(page.getByRole("heading", { name: "Register as a patient" })).toBeVisible();
  await expect(page.getByText(/clinic code|invitation/i).first()).toBeVisible();
});

test("dentist registration page loads", async ({ page }) => {
  await page.goto("/register/dentist");
  await expect(page.getByRole("heading", { name: "Register as a dentist" })).toBeVisible();
  await expect(page.getByText(/invitation/i).first()).toBeVisible();
});

test("portal pages gate unauthenticated callers", async ({ page }) => {
  await page.goto("/portal/patient");
  await expect(page.getByRole("heading", { name: "Patient portal" })).toBeVisible();
  await expect(page.getByText(/authentication is currently|sign in to access/i)).toBeVisible();
  await page.goto("/portal/practitioner");
  await expect(page.getByRole("heading", { name: "Dentist onboarding" })).toBeVisible();
});

test("public OTP endpoints fail closed when identity runtime unset", async ({ request }) => {
  const response = await request.post("/api/auth/otp/request", {
    data: {
      destinationType: "EMAIL",
      destination: "a@example.test",
      purpose: "LOGIN_EMAIL",
    },
  });
  expect([503, 400, 429]).toContain(response.status());
});

test("passwordless login request fails closed when AUTH_PROVIDER unset", async ({ request }) => {
  const response = await request.post("/api/auth/login/otp/request", {
    data: { destination: "nobody@example.test", channel: "email" },
  });
  expect([503, 400, 401, 429]).toContain(response.status());
});

test("health endpoint returns ok without business payload", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    status: string;
    service: string;
    milestone: string;
  };
  expect(body).toMatchObject({
    status: "ok",
    service: "web",
    milestone: "M7",
  });
});

test("authorization probe denies unauthenticated access", async ({ request }) => {
  const response = await request.get("/api/authz/organization", {
    headers: { "x-organization-id": "org_untrusted" },
  });
  expect(response.status()).toBe(401);
  const body = (await response.json()) as { error?: string };
  expect(body.error).toBe("unauthenticated");
});

test("patient API denies unauthenticated access", async ({ request }) => {
  const response = await request.get("/api/patients", {
    headers: { "x-organization-id": "org_untrusted" },
  });
  expect(response.status()).toBe(401);
  const body = (await response.json()) as { error?: string };
  expect(body.error).toBe("unauthenticated");
});

test("appointment API denies unauthenticated access", async ({ request }) => {
  const response = await request.get("/api/appointments", {
    headers: { "x-organization-id": "org_untrusted" },
  });
  expect(response.status()).toBe(401);
  const body = (await response.json()) as { error?: string };
  expect(body.error).toBe("unauthenticated");
});

test("appointment confirm API denies unauthenticated access", async ({ request }) => {
  const response = await request.post("/api/appointments/appt_untrusted/confirm", {
    headers: { "x-organization-id": "org_untrusted" },
    data: {},
  });
  expect(response.status()).toBe(401);
  const body = (await response.json()) as { error?: string };
  expect(body.error).toBe("unauthenticated");
});

test("practitioner API denies unauthenticated access", async ({ request }) => {
  const response = await request.get("/api/practitioners", {
    headers: { "x-organization-id": "org_untrusted" },
  });
  expect(response.status()).toBe(401);
  const body = (await response.json()) as { error?: string };
  expect(body.error).toBe("unauthenticated");
});

test("practitioner schedule list API denies unauthenticated access", async ({ request }) => {
  const response = await request.get("/api/practitioners/prac_untrusted/schedules", {
    headers: { "x-organization-id": "org_untrusted" },
  });
  expect(response.status()).toBe(401);
  const body = (await response.json()) as { error?: string };
  expect(body.error).toBe("unauthenticated");
});

test("practitioner leave list API denies unauthenticated access", async ({ request }) => {
  const response = await request.get("/api/practitioners/prac_untrusted/unavailability", {
    headers: { "x-organization-id": "org_untrusted" },
  });
  expect(response.status()).toBe(401);
  const body = (await response.json()) as { error?: string };
  expect(body.error).toBe("unauthenticated");
});

test("notification API denies unauthenticated access", async ({ request }) => {
  const response = await request.get("/api/notifications/outbox_untrusted", {
    headers: { "x-organization-id": "org_untrusted" },
  });
  expect(response.status()).toBe(401);
  const body = (await response.json()) as { error?: string };
  expect(body.error).toBe("unauthenticated");
});
