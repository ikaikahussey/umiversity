import { afterEach, describe, expect, it } from "vitest";
import { isAuthorizedCron } from "@/lib/cron";

const req = (auth?: string) => new Request("http://x/api/cron/streaks", { headers: auth ? { authorization: auth } : {} });

describe("isAuthorizedCron", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });
  it("refuses everything when CRON_SECRET is unset", () => {
    expect(isAuthorizedCron(req("Bearer "))).toBe(false);
    expect(isAuthorizedCron(req())).toBe(false);
  });
  it("accepts only the exact bearer secret", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isAuthorizedCron(req("Bearer s3cret"))).toBe(true);
    expect(isAuthorizedCron(req("Bearer wrong"))).toBe(false);
    expect(isAuthorizedCron(req("s3cret"))).toBe(false);
  });
});
