import { expect, test } from "@playwright/test";

test("landing page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DentalCare AI" })).toBeVisible();
  await expect(page.getByText("Appointment notification delivery")).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter workspace" })).toBeVisible();
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
