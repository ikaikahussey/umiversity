import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("sign-in page renders the Neon Auth form", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await expect(page.getByRole("button", { name: /sign in|login/i }).first()).toBeVisible();
});

test("protected settings redirect anonymous visitors to sign-in", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
});

test("a signed-in user edits their profile and sees it at /u/[handle]", async ({ page }) => {
  await signInAs(page, "e2e-profile", "Kalani Test");
  await page.goto("/");
  await expect(page.getByTestId("profile-link")).toHaveText("@kalanitest");
  await page.goto("/settings");
  await page.getByLabel("Handle").fill("kalani");
  await page.getByLabel("Bio").fill("Learning ʻōlelo Hawaiʻi");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("/u/kalani");
  await page.goto("/u/kalani");
  await expect(page.getByRole("heading", { name: "Kalani Test" })).toBeVisible();
  await expect(page.getByText("Learning ʻōlelo Hawaiʻi")).toBeVisible();
});

test("search matches fields without diacritics", async ({ page }) => {
  await page.goto("/search?q=hawaiian");
  await expect(page.getByTestId("search-results")).toContainText("Hawaiian Language");
});

test("PWA manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const json = await res.json();
  expect(json.display).toBe("standalone");
});
