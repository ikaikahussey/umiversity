import type { Page } from "@playwright/test";

/** Signs in through the test-only identity cookie (active only when E2E_TEST_AUTH=1). */
export async function signInAs(page: Page, id: string, name: string) {
  await page.context().addCookies([
    { name: "e2e_user", value: encodeURIComponent(`${id}|${name}`), url: "http://localhost:3100" },
  ]);
}
