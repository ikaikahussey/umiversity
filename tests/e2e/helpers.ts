import type { Page } from "@playwright/test";
import { Client } from "pg";

export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/umiversity_e2e";

/** Signs in through the test-only identity cookie (active only when E2E_TEST_AUTH=1). */
export async function signInAs(page: Page, id: string, name: string) {
  await page.context().clearCookies();
  await page.context().addCookies([
    { name: "e2e_user", value: encodeURIComponent(`${id}|${name}`), url: "http://localhost:3100" },
  ]);
}

/** Runs SQL against the e2e database for arranging test state. */
export async function dbQuery<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: E2E_DB });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

/** Visits the site once so the app creates the user row, then applies a site role. */
export async function createUser(page: Page, id: string, name: string, role: "member" | "moderator" | "admin" = "member") {
  await signInAs(page, id, name);
  await page.goto("/");
  if (role !== "member") await dbQuery("UPDATE users SET role = $1 WHERE id = $2", [role, id]);
}
