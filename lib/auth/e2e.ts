/**
 * Test-only identity override used by Playwright. It is active only when
 * E2E_TEST_AUTH=1 and the app is not running on Vercel, so it can never be
 * enabled in a deployed environment.
 */
export const E2E_COOKIE = "e2e_user";

export function e2eAuthEnabled(): boolean {
  return process.env.E2E_TEST_AUTH === "1" && !process.env.VERCEL && process.env.NODE_ENV !== "production";
}
