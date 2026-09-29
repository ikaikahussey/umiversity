import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isoWeek, localDate, localHour, weekStart } from "@/lib/dates";
import { applyActivity, emptyStreak, nightlyCheck } from "@/lib/streaks";

describe("dates", () => {
  it("computes local dates and hours by timezone", () => {
    const at = new Date("2026-09-30T08:30:00Z");
    expect(localDate(at, "Pacific/Honolulu")).toBe("2026-09-29");
    expect(localDate(at, "Asia/Tokyo")).toBe("2026-09-30");
    expect(localHour(at, "Pacific/Honolulu")).toBe(22);
    expect(localHour(new Date("2026-09-30T00:10:00Z"), "UTC")).toBe(0);
  });
  it("does date arithmetic", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-02-27", "2026-03-01")).toBe(2);
    expect(weekStart("2026-10-04")).toBe("2026-09-28");
    expect(weekStart("2026-09-28")).toBe("2026-09-28");
    expect(isoWeek("2026-09-29")).toBe("2026-W40");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(isoWeek("2021-01-04")).toBe("2021-W01");
  });
});

describe("streaks", () => {
  it("counts consecutive days and ignores repeats on the same day", () => {
    let s = applyActivity(emptyStreak(), "2026-09-28");
    s = applyActivity(s, "2026-09-28");
    s = applyActivity(s, "2026-09-29");
    expect(s).toMatchObject({ current: 2, longest: 2, lastActiveDate: "2026-09-29" });
  });

  it("spends one freeze per week on a single missed day", () => {
    let s = applyActivity(emptyStreak(), "2026-09-28"); // Mon
    s = applyActivity(s, "2026-09-30"); // skipped Tue
    expect(s).toMatchObject({ current: 2, freezesLeft: 0 });
    s = applyActivity(s, "2026-10-02"); // skipped Thu, no freeze left
    expect(s).toMatchObject({ current: 1, longest: 2 });
  });

  it("restores the freeze in a new week", () => {
    let s = applyActivity(emptyStreak(), "2026-09-28");
    s = applyActivity(s, "2026-09-30");
    s = applyActivity(s, "2026-10-01");
    s = applyActivity(s, "2026-10-02");
    s = applyActivity(s, "2026-10-03");
    s = applyActivity(s, "2026-10-04"); // Sunday
    s = applyActivity(s, "2026-10-06"); // Tue of next week, skipped Mon
    expect(s).toMatchObject({ current: 7, freezesLeft: 0, freezeWeek: "2026-W41" });
  });

  it("resets after a two-day gap", () => {
    let s = applyActivity(emptyStreak(), "2026-09-28");
    s = applyActivity(s, "2026-10-01");
    expect(s.current).toBe(1);
  });

  it("nightly check bridges one missed day with a freeze, else resets", () => {
    let s = applyActivity(emptyStreak(), "2026-09-28");
    s = applyActivity(s, "2026-09-29");
    expect(nightlyCheck(s, "2026-09-30")).toEqual(s);
    const bridged = nightlyCheck(s, "2026-10-01");
    expect(bridged).toMatchObject({ current: 2, freezesLeft: 0, lastActiveDate: "2026-09-30" });
    expect(applyActivity(bridged, "2026-10-01").current).toBe(3);
    const reset = nightlyCheck(bridged, "2026-10-03");
    expect(reset.current).toBe(0);
    expect(reset.longest).toBe(2);
  });
});
