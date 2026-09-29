import { expect, test } from "@playwright/test";
import { createUser, dbQuery, signInAs } from "./helpers";

test("follow, daily card, lesson completion, streak, goal and breadth map", async ({ page }) => {
  await createUser(page, "e2e-learner", "Learner Lani");
  await signInAs(page, "e2e-learner", "Learner Lani");

  await page.goto("/c/olelo-hawaii");
  await page.getByRole("button", { name: "Follow" }).click();
  await expect(page.getByTestId("followers")).toContainText("1 follower");

  // Today's seeded card for the followed course appears on home.
  await page.goto("/");
  const cards = page.getByTestId("daily-cards");
  await expect(cards.locator("li")).toHaveCount(1);
  await cards.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByTestId("streak")).toHaveText("1 day");

  // Complete the single-lesson unit "Nā Helu".
  await page.goto("/c/olelo-hawaii/na-helu/ekahi-a-umi");
  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await expect(page.getByRole("status")).toContainText("unit finished");
  await page.reload();
  await expect(page.getByTestId("completion")).toContainText("Completed");

  await page.goto("/");
  await expect(page.getByTestId("weekly-goal")).toContainText("1 / 3 lessons");
  await expect(page.getByTestId("suggestion")).toHaveText("Moʻolelo Hawaiʻi");

  await page.goto("/u/learnerlani");
  await expect(page.getByTestId("learning-badges")).toContainText("Completed: ʻŌlelo Hawaiʻi Unit 3");
  await expect(page.getByTestId("breadth-map")).toContainText("Hawaiian Language1");

  // A second field reaches Polymath I.
  await page.goto("/c/moolelo-hawaii/ke-kumulipo/the-kumulipo");
  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await expect(page.getByRole("status")).toContainText("Polymath I reached");
  await page.goto("/u/learnerlani");
  await expect(page.getByTestId("polymath-level")).toHaveText("Polymath I");
});

test("community badge: endorsements, steward approval, notification", async ({ page }) => {
  await createUser(page, "e2e-claimant", "Kumu Claimant");
  await createUser(page, "e2e-steward5", "Steward Five");
  const holders = ["e2e-holder1", "e2e-holder2", "e2e-holder3"];
  for (const [i, h] of holders.entries()) await createUser(page, h, `Holder ${i + 1}`);
  const [field] = await dbQuery<{ id: string }>("SELECT id FROM fields WHERE slug = 'hawaiian-language'");
  const [course] = await dbQuery<{ id: string }>("SELECT id FROM courses WHERE slug = 'olelo-hawaii'");
  for (const h of holders) {
    await dbQuery("INSERT INTO badges (user_id, type, field_id, label, status) VALUES ($1, 'community', $2, 'Fluent speaker', 'verified')", [h, field.id]);
  }
  await dbQuery("INSERT INTO course_roles (course_id, user_id, role) VALUES ($1, 'e2e-steward5', 'steward')", [course.id]);

  await signInAs(page, "e2e-claimant", "Kumu Claimant");
  await page.goto("/settings/badges");
  await page.getByLabel("Type").selectOption("community");
  await page.getByLabel("Field").selectOption({ label: "Languages — Hawaiian Language" });
  await page.getByLabel("Badge label").fill("Mānaleo (native speaker)");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("endorse");
  await page.reload();
  const endorseHref = await page.getByRole("link", { name: "Endorsement link" }).getAttribute("href");

  for (const [i, h] of holders.entries()) {
    await signInAs(page, h, `Holder ${i + 1}`);
    await page.goto(endorseHref!);
    await page.getByRole("button", { name: "Endorse" }).click();
    await expect(page.getByRole("status")).toContainText(`Endorsed (${i + 1} so far)`);
  }

  await signInAs(page, "e2e-steward5", "Steward Five");
  await page.goto(endorseHref!);
  await expect(page.getByTestId("endorsements")).toContainText("3 of 3");
  await page.getByRole("button", { name: "Approve (Steward)" }).click();
  await expect(page.getByText("verified", { exact: true })).toBeVisible();

  await signInAs(page, "e2e-claimant", "Kumu Claimant");
  await page.goto("/u/kumuclaimant");
  await expect(page.getByTestId("credentials")).toContainText("Mānaleo (native speaker)");
  await expect(page.getByTestId("notif-link")).toContainText("1");
  await page.goto("/notifications");
  await expect(page.getByTestId("notifications")).toContainText("was verified");
});

test("admin queue lists pending badges; members are kept out", async ({ page }) => {
  await createUser(page, "e2e-mod", "Mod Person", "moderator");
  await createUser(page, "e2e-nobody", "Nobody");
  const [field] = await dbQuery<{ id: string }>("SELECT id FROM fields WHERE slug = 'history'");
  await dbQuery(
    "INSERT INTO badges (user_id, type, field_id, label, status, evidence_blob_url) VALUES ('e2e-nobody', 'degree', $1, 'PhD, History', 'pending', 'badge-evidence/x.pdf')",
    [field.id],
  );
  await signInAs(page, "e2e-nobody", "Nobody");
  await page.goto("/admin");
  await expect(page.getByText("Moderators and admins only.")).toBeVisible();
  const denied = await page.request.get(`/api/badges/00000000-0000-0000-0000-000000000000/evidence`);
  expect(denied.status()).toBe(403);

  await signInAs(page, "e2e-mod", "Mod Person");
  await page.goto("/admin");
  const queue = page.getByTestId("badge-queue");
  await expect(queue).toContainText("PhD, History");
  await expect(queue.getByRole("link", { name: "View private document" })).toBeVisible();
  await queue.locator("li", { hasText: "PhD, History" }).getByRole("button", { name: "Reject" }).click();
  await expect(page.getByRole("status")).toContainText("Badge decided");
  await expect(queue).not.toContainText("PhD, History");
});
