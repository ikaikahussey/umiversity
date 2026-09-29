import { expect, test } from "@playwright/test";
import { createUser, signInAs } from "./helpers";

const DESC = "Learn to navigate by stars, swells and birds, following Polynesian wayfinding practice.";

test("request, duplicate check, votes and promotion to a draft course", async ({ page }) => {
  await createUser(page, "e2e-req-a", "Requester A");
  await createUser(page, "e2e-req-b", "Voter B");
  await createUser(page, "e2e-req-c", "Voter C");

  await signInAs(page, "e2e-req-a", "Requester A");
  await page.goto("/requests");
  await page.getByLabel("Course title").fill("Star Navigation");
  await page.getByLabel("Description").fill(DESC);
  await page.getByLabel("Field").selectOption({ label: "Practical Skills — Navigation and Wayfinding" });
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const requestUrl = page.url();
  await expect(page.getByTestId("vote-count")).toContainText("1 of 3");

  // B tries to file a near-duplicate and is shown the existing request.
  await signInAs(page, "e2e-req-b", "Voter B");
  await page.goto("/requests");
  await page.getByLabel("Course title").fill("Star navigation basics");
  await page.getByLabel("Description").fill(DESC);
  await page.getByLabel("Field").selectOption({ label: "Practical Skills — Navigation and Wayfinding" });
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByTestId("duplicates")).toContainText("Star Navigation");
  await expect(page.getByLabel("Course title")).toHaveValue("Star navigation basics");
  await page.getByTestId("duplicates").getByRole("link", { name: "Star Navigation" }).click();
  await page.getByRole("button", { name: "Upvote" }).click();
  await expect(page.getByTestId("vote-count")).toContainText("2 of 3");

  // C's vote reaches the goal and promotes the request.
  await signInAs(page, "e2e-req-c", "Voter C");
  await page.goto(requestUrl);
  await page.getByRole("button", { name: "Upvote" }).click();
  await expect(page).toHaveURL(/\/c\/star-navigation/);
  await expect(page.getByRole("status")).toContainText("now a draft course");
  await expect(page.getByText("draft", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "@requestera" })).toBeVisible();

  await page.goto(requestUrl);
  await expect(page.getByText("This request became the course")).toBeVisible();
});

test("requests board has top and new tabs", async ({ page }) => {
  await page.goto("/requests?sort=new");
  await expect(page.getByRole("tab", { name: "New" })).toHaveAttribute("aria-selected", "true");
});
