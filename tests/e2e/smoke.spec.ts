import { expect, test } from "@playwright/test";

test("technical landing page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DentalCare AI" })).toBeVisible();
  await expect(page.getByText("Patient, Appointment, and Notification")).toBeVisible();
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
    milestone: "M0",
  });
});
