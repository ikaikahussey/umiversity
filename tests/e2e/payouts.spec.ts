import { expect, test } from "@playwright/test";
import { createUser, dbQuery, signInAs } from "./helpers";

test("admin manages partners and revenue; outbound links are tracked; periods compute", async ({ page }) => {
  await createUser(page, "e2e-payadmin", "Pay Admin", "admin");
  const [course] = await dbQuery<{ id: string }>("SELECT id FROM courses WHERE slug = 'moolelo-hawaii'");
  await dbQuery(
    "INSERT INTO resources (course_id, url, title, type, level, approved) VALUES ($1, 'https://www.bookshop.org/b/hawaiian-kingdom', 'Hawaiian Kingdom history', 'book', 'beginner', true)",
    [course.id],
  );

  await signInAs(page, "e2e-payadmin", "Pay Admin");
  await page.goto("/admin/payouts");
  await page.getByLabel("Partner name").fill("Bookshop");
  await page.getByLabel("Network").fill("Awin");
  await page.getByLabel("Domain").fill("bookshop.org");
  await page.getByLabel("Tracking parameter").fill("aid=umi");
  await page.getByLabel("Program terms permit sharing").check();
  await page.getByRole("button", { name: "Save partner" }).click();
  await expect(page.getByRole("status")).toContainText("Saved Bookshop");
  await page.reload();
  await expect(page.getByTestId("partners")).toContainText("bookshop.org");

  await page.getByLabel("Month received (YYYY-MM)").fill("2026-07");
  await page.getByLabel("Gross ($)").fill("1,000.00");
  await page.getByLabel("Refunds and reversals ($)").fill("200");
  await page.getByRole("button", { name: "Record revenue" }).click();
  await expect(page.getByRole("status")).toContainText("Revenue recorded");
  await page.reload();
  await expect(page.getByTestId("revenue")).toContainText("net $800.00");

  await page.goto("/c/moolelo-hawaii");
  const link = page.getByRole("link", { name: "Hawaiian Kingdom history" });
  const res = await page.request.get((await link.getAttribute("href"))!, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers().location).toBe("https://www.bookshop.org/b/hawaiian-kingdom?aid=umi");
  const [{ n }] = await dbQuery<{ n: string }>("SELECT count(*) AS n FROM affiliate_clicks");
  expect(Number(n)).toBe(1);

  await page.goto("/admin/payouts");
  await page.getByRole("textbox", { name: /^Month to compute/ }).fill("2026-07");
  await page.getByRole("button", { name: "Compute month" }).click();
  await expect(page.getByRole("status")).toContainText("Pool $400.00");
  await page.reload();
  await expect(page.getByTestId("periods")).toContainText("2026-07: pool $400.00");
});

test("a learner sees held points and the payout setup", async ({ page }) => {
  await createUser(page, "e2e-earner", "Earner Kai");
  await signInAs(page, "e2e-earner", "Earner Kai");
  await page.goto("/c/moolelo-hawaii/ke-kumulipo/the-kumulipo");
  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await expect(page.getByRole("status")).toContainText("unit finished");
  await page.goto("/settings/payouts");
  await expect(page.getByTestId("points-summary")).toContainText("23");
  await expect(page.getByTestId("point-events")).toContainText("+20 new field");
  await expect(page.getByTestId("point-events")).toContainText("+3 unit completed");
  await expect(page.getByText("New accounts start earning")).toBeVisible();
  await page.getByRole("button", { name: "Set up payouts" }).click();
  await expect(page.getByText("Payouts are not configured yet")).toBeVisible();
});
