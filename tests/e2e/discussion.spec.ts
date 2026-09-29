import { expect, test } from "@playwright/test";
import { createUser, dbQuery, signInAs } from "./helpers";

const LESSON = "/c/olelo-hawaii/ka-piapa/na-koneka";

test("ask, answer, vote and accept on a lesson", async ({ page }) => {
  await createUser(page, "e2e-asker", "Asker Person");
  await createUser(page, "e2e-answerer", "Answer Person");

  await signInAs(page, "e2e-asker", "Asker Person");
  await page.goto(LESSON);
  await page.getByText("Ask a question").click();
  await page.getByLabel("Question title").fill("When is w pronounced like v?");
  await page.getByLabel("Details (Markdown)").fill("I hear both in *Hawaiʻi*.");
  await page.getByRole("button", { name: "Post question" }).click();
  await expect(page).toHaveURL(/\/c\/olelo-hawaii\/q\//);
  const threadUrl = page.url();

  await signInAs(page, "e2e-answerer", "Answer Person");
  await page.goto(threadUrl);
  await page.getByLabel("Your answer (Markdown)").fill("Usually **v** after i and e, **w** after o and u.");
  await page.getByRole("button", { name: "Post answer" }).click();
  await expect(page.getByTestId("answers")).toContainText("after i and e");
  // Answerer cannot vote on their own answer.
  await expect(page.getByTestId("answers").getByRole("button", { name: "Upvote" })).toBeDisabled();

  await signInAs(page, "e2e-asker", "Asker Person");
  await page.goto(threadUrl);
  const answer = page.getByTestId("answers").locator("li").first();
  await answer.getByRole("button", { name: "Upvote" }).click();
  await expect(answer.locator("[data-testid^=score-]")).toHaveText("1");
  await answer.getByRole("button", { name: "Accept" }).click();
  await expect(answer.getByText("Accepted answer")).toBeVisible();

  await page.goto(LESSON);
  await expect(page.getByTestId("thread-list")).toContainText("answered");
});

test("member links wait for editor approval, then appear and redirect", async ({ page }) => {
  await createUser(page, "e2e-linker", "Link Adder");
  await createUser(page, "e2e-reseditor", "Resource Editor");
  const [course] = await dbQuery<{ id: string }>("SELECT id FROM courses WHERE slug = 'olelo-hawaii'");
  await dbQuery("INSERT INTO course_roles (course_id, user_id, role) VALUES ($1, 'e2e-reseditor', 'editor')", [course.id]);

  await signInAs(page, "e2e-linker", "Link Adder");
  await page.goto(LESSON);
  await page.getByText("Add a resource").click();
  await page.getByLabel("URL").fill("https://ulukau.org/");
  await page.getByLabel("Link title").fill("Ulukau Hawaiian Electronic Library");
  await page.getByRole("button", { name: "Add link" }).click();
  await expect(page.getByRole("status")).toContainText("an editor will review");
  await expect(page.getByTestId("resource-list")).toHaveCount(0);

  await signInAs(page, "e2e-reseditor", "Resource Editor");
  await page.goto("/c/olelo-hawaii/edit");
  await expect(page.getByTestId("pending-resources")).toContainText("Ulukau Hawaiian Electronic Library");
  await page.getByRole("button", { name: "Approve link" }).click();
  await expect(page.getByRole("status")).toContainText("Resource approved");

  await page.goto(LESSON);
  const link = page.getByRole("link", { name: "Ulukau Hawaiian Electronic Library" });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const res = await page.request.get(href!, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers().location).toBe("https://ulukau.org/");
});

test("cron endpoints refuse requests without the secret", async ({ request }) => {
  const res = await request.get("/api/cron/youtube");
  expect(res.status()).toBe(401);
});
