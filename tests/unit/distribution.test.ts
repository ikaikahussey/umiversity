import { afterEach, describe, expect, it } from "vitest";
import { distribute, poolFromNetRevenue, poolPercent } from "@/lib/services/distribution";

describe("pool", () => {
  afterEach(() => {
    delete process.env.PAYOUT_POOL_PERCENT;
  });
  it("is 50% of eligible net revenue by default and configurable", () => {
    expect(poolPercent()).toBe(50);
    expect(poolFromNetRevenue(100_001)).toBe(50_000);
    process.env.PAYOUT_POOL_PERCENT = "40";
    expect(poolFromNetRevenue(100_000)).toBe(40_000);
    process.env.PAYOUT_POOL_PERCENT = "0";
    expect(poolPercent()).toBe(50);
    expect(poolFromNetRevenue(-5)).toBe(0);
  });
});

describe("distribute", () => {
  it("splits pro rata by points", () => {
    const earners = Array.from({ length: 40 }, (_, i) => ({ userId: `u${i}`, points: 10, carriedInCents: 0 }));
    const r = distribute(1_000_000, earners);
    expect(r.totalPoints).toBe(400);
    expect(r.allocations.every((a) => a.shareCents === 25_000 && a.status === "pending" && !a.capped)).toBe(true);
    expect(r.retainedCents).toBe(0);
  });

  it("caps each user at 5% of the pool and retains the excess", () => {
    const r = distribute(100_000, [
      { userId: "whale", points: 900, carriedInCents: 0 },
      { userId: "small", points: 100, carriedInCents: 0 },
    ]);
    const whale = r.allocations.find((a) => a.userId === "whale")!;
    const small = r.allocations.find((a) => a.userId === "small")!;
    expect(whale).toMatchObject({ shareCents: 5_000, capped: true, status: "pending" });
    expect(small).toMatchObject({ shareCents: 5_000, capped: true });
    expect(r.retainedCents).toBe(90_000);
  });

  it("rolls shares under $10 over and adds carried balances", () => {
    const r = distribute(100_000, [
      { userId: "a", points: 1, carriedInCents: 0 },
      { userId: "b", points: 1, carriedInCents: 950 },
      { userId: "c", points: 0, carriedInCents: 300 },
      { userId: "d", points: 998, carriedInCents: 0 },
    ]);
    const by = Object.fromEntries(r.allocations.map((a) => [a.userId, a]));
    expect(by.a).toMatchObject({ shareCents: 100, amountCents: 100, status: "rolled_over" });
    expect(by.b).toMatchObject({ shareCents: 100, amountCents: 1_050, status: "pending" });
    expect(by.c).toMatchObject({ shareCents: 0, amountCents: 300, status: "rolled_over" });
    expect(by.d.status).toBe("pending");
  });

  it("handles an empty month", () => {
    expect(distribute(0, []).allocations).toEqual([]);
    const r = distribute(0, [{ userId: "a", points: 5, carriedInCents: 0 }]);
    expect(r.allocations[0]).toMatchObject({ amountCents: 0, status: "rolled_over" });
  });
});
