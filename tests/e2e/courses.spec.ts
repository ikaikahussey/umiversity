import { expect, test } from "@playwright/test";
import { createUser, dbQuery, signInAs } from "./helpers";

test("launch courses are listed and lessons render", async ({ page }) => {
  await page.goto("/courses");
  await expect(page.getByRole("link", { name: "ʻŌlelo Hawaiʻi" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Moʻolelo Hawaiʻi" })).toBeVisible();
  await page.getByRole("link", { name: "ʻŌlelo Hawaiʻi" }).click();
  await expect(page.getByTestId("outline")).toContainText("Ka Pīʻāpā");
  await page.getByRole("link", { name: "Nā Woela — Vowels" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nā Woela — Vowels" })).toBeVisible();
  await expect(page.locator(".prose-lesson")).toContainText("five vowels");
});

test("search finds a lesson typed without diacritics", async ({ page }) => {
  await page.goto("/search?q=kahako");
  await expect(page.getByTestId("search-results")).toContainText("Ke Kahakō — Long Vowels");
});

test("contributor proposes, editor approves, steward reverts", async ({ page }) => {
  await createUser(page, "e2e-contrib", "Pua Contributor");
  await createUser(page, "e2e-editor", "Kai Editor");
  await createUser(page, "e2e-admin", "Ana Admin", "admin");
  const [course] = await dbQuery<{ id: string }>("SELECT id FROM courses WHERE slug = 'moolelo-hawaii'");
  await dbQuery("INSERT INTO course_roles (course_id, user_id, role) VALUES ($1,'e2e-contrib','contributor'),($1,'e2e-editor','editor')", [course.id]);

  // Contributor proposes an edit.
  await signInAs(page, "e2e-contrib", "Pua Contributor");
  await page.goto("/c/moolelo-hawaii/voyaging-and-settlement/wayfinding");
  await page.getByRole("link", { name: "Propose edit" }).click();
  const body = page.getByLabel("Lesson text (Markdown)");
  await body.fill((await body.inputValue()) + "\n\nNainoa Thompson later navigated Hōkūleʻa without instruments.");
  await page.getByLabel("Edit summary").fill("Add Nainoa Thompson");
  await page.getByRole("button", { name: "Propose edit" }).click();
  await expect(page.getByRole("status")).toContainText("Edit proposed");

  // Editor sees the diff and approves.
  await signInAs(page, "e2e-editor", "Kai Editor");
  await page.goto("/c/moolelo-hawaii/edit");
  await expect(page.getByTestId("pending-revisions")).toContainText("Add Nainoa Thompson");
  await expect(page.getByTestId("diff")).toContainText("+ Nainoa Thompson");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status")).toContainText("Approved");
  await page.goto("/c/moolelo-hawaii/voyaging-and-settlement/wayfinding");
  await expect(page.locator(".prose-lesson")).toContainText("Nainoa Thompson");

  // Admin (steward-level) reverts to the seed revision.
  await signInAs(page, "e2e-admin", "Ana Admin");
  await page.goto("/c/moolelo-hawaii/voyaging-and-settlement/wayfinding");
  await page.getByRole("link", { name: "Propose edit" }).click();
  await page.getByRole("button", { name: "Revert to this" }).click();
  await expect(page.getByRole("status")).toContainText("Reverted");
  await page.goto("/c/moolelo-hawaii/voyaging-and-settlement/wayfinding");
  await expect(page.locator(".prose-lesson")).not.toContainText("Nainoa Thompson");
});

test("members cannot reach editing tools", async ({ page }) => {
  await createUser(page, "e2e-member", "Plain Member");
  await page.goto("/c/olelo-hawaii/ka-piapa/na-woela");
  await expect(page.getByRole("link", { name: "Propose edit" })).toHaveCount(0);
  await page.goto("/c/olelo-hawaii/edit");
  await expect(page.getByText("Editing opens to Contributors")).toBeVisible();
});
