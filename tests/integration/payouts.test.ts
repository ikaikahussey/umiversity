import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  affiliateClicks,
  courseRoles,
  courses,
  lessons,
  payoutAccounts,
  payouts,
  pointEvents,
  resources,
  units,
  users,
} from "@/db/schema";
import type { StripeClient } from "@/lib/stripe";
import { recordRevenue, revenueForMonth, trackOutbound, upsertPartner } from "@/lib/services/affiliates";
import { createLesson, createUnit, proposeRevision, revertLesson, reviewRevision } from "@/lib/services/courses";
import { acceptAnswer, createPost, createThread, vote } from "@/lib/services/discussion";
import { completeLesson } from "@/lib/services/engagement";
import {
  computeMonthlyPayout,
  executeTransfers,
  settleableMonth,
  startOnboarding,
  syncOnboarding,
  userPayouts,
} from "@/lib/services/payouts";
import { addResource } from "@/lib/services/resources";
import { POINTS, awardPoints, clawBack, clearMaturedPoints, collusionFlags, pointsSummary, setPointsFrozen } from "@/lib/services/points";
import { submitRequest, voteRequest } from "@/lib/services/requests";
import { makeField, makeUser, resetDb, testDb as db } from "../helpers/db";

beforeEach(resetDb);

async function eventsFor(userId: string) {
  return db.select().from(pointEvents).where(eq(pointEvents.userId, userId));
}

async function courseSetup() {
  const { field } = await makeField("History", "Humanities");
  const [course] = await db.insert(courses).values({ fieldId: field.id, title: "C", slug: "c" }).returning();
  const steward = await makeUser();
  const editor = await makeUser();
  const contributor = await makeUser();
  await db.insert(courseRoles).values([
    { courseId: course.id, userId: steward.id, role: "steward" },
    { courseId: course.id, userId: editor.id, role: "editor" },
    { courseId: course.id, userId: contributor.id, role: "contributor" },
  ]);
  return { field, course, steward, editor, contributor };
}

describe("point events", () => {
  it("awards approved edits, claws back reverted ones, and never double-awards", async () => {
    const s = await courseSetup();
    const unit = await createUnit(db, s.editor, s.course.id, { title: "Unit" });
    const lesson = await createLesson(db, s.editor, unit.id, { title: "Lesson" });
    const r1 = await proposeRevision(db, s.contributor, lesson.id, { bodyMd: "v1" });
    await reviewRevision(db, s.editor, r1.id, "approve");
    const r2 = await proposeRevision(db, s.contributor, lesson.id, { bodyMd: "v2" });
    await reviewRevision(db, s.editor, r2.id, "approve");
    let ev = await eventsFor(s.contributor.id);
    expect(ev.map((e) => [e.type, e.points, e.status])).toEqual([
      ["approved_edit", 15, "held"],
      ["approved_edit", 15, "held"],
    ]);
    expect(ev[0].clearsAt.getTime() - ev[0].createdAt.getTime()).toBe(30 * 86_400_000);
    await revertLesson(db, s.steward, lesson.id, r1.id);
    ev = await eventsFor(s.contributor.id);
    expect(ev.find((e) => e.sourceId === r2.id)?.status).toBe("clawed_back");
    expect(ev.find((e) => e.sourceId === r1.id)?.status).toBe("held");
    // Steward self-approval earns nothing.
    const own = await proposeRevision(db, s.steward, lesson.id, { bodyMd: "steward" });
    await reviewRevision(db, s.steward, own.id, "approve");
    expect(await eventsFor(s.steward.id)).toEqual([]);
  });

  it("awards accepted answers, not self-accepted, and claws back on reversal", async () => {
    const s = await courseSetup();
    const asker = await makeUser();
    const a = await makeUser();
    const b = await makeUser();
    const t = await createThread(db, asker, { courseId: s.course.id }, { title: "Points question", bodyMd: "?" });
    const pa = await createPost(db, a, t.id, "A");
    const pb = await createPost(db, b, t.id, "B");
    const own = await createPost(db, s.steward, t.id, "steward answer");
    await acceptAnswer(db, asker, t.id, pa.id);
    expect((await eventsFor(a.id)).map((e) => e.status)).toEqual(["held"]);
    await acceptAnswer(db, asker, t.id, pb.id);
    expect((await eventsFor(a.id)).map((e) => e.status)).toEqual(["clawed_back"]);
    expect((await eventsFor(b.id)).map((e) => e.points)).toEqual([POINTS.accepted_answer]);
    await acceptAnswer(db, asker, t.id, pa.id);
    expect((await eventsFor(a.id)).map((e) => e.status)).toEqual(["held"]);
    await acceptAnswer(db, s.steward, t.id, own.id);
    expect(await eventsFor(s.steward.id)).toEqual([]);
    const selfT = await createThread(db, asker, { courseId: s.course.id }, { title: "Own question", bodyMd: "?" });
    const selfP = await createPost(db, asker, selfT.id, "self");
    await acceptAnswer(db, asker, selfT.id, selfP.id);
    expect(await eventsFor(asker.id)).toEqual([]);
  });

  it("awards resources at score 5, units, new fields, polymath levels and promotions", async () => {
    const s = await courseSetup();
    const adder = await makeUser();
    const r = await addResource(db, s.editor, { courseId: s.course.id, url: "https://example.org/x", title: "Good link" });
    await db.update(resources).set({ addedById: adder.id }).where(eq(resources.id, r.id));
    for (let i = 0; i < 5; i++) await vote(db, await makeUser(), "resource", r.id, 1);
    expect((await eventsFor(adder.id)).map((e) => [e.type, e.points])).toEqual([["approved_resource", 5]]);

    const learner = await makeUser();
    const { field: f2 } = await makeField("Physics", "Sciences");
    const [c2] = await db.insert(courses).values({ fieldId: f2.id, title: "P", slug: "p" }).returning();
    const ids = [];
    for (const c of [s.course, c2]) {
      const [u] = await db.insert(units).values({ courseId: c.id, position: 1, slug: "u", title: "U" }).returning();
      const [l] = await db.insert(lessons).values({ unitId: u.id, position: 1, slug: "l", title: "L" }).returning();
      ids.push(l.id);
    }
    for (const id of ids) await completeLesson(db, learner, id);
    const types = (await eventsFor(learner.id)).map((e) => `${e.type}:${e.points}`).sort();
    expect(types).toEqual(["new_field:20", "new_field:20", "polymath_level:50", "unit_completed:3", "unit_completed:3"]);

    process.env.REQUEST_PROMOTE_THRESHOLD = "2";
    const requester = await makeUser();
    const res = await submitRequest(db, requester, {
      title: "Quantum Optics",
      description: "Light and matter at the quantum level, for curious learners.",
      fieldId: f2.id,
    });
    if (res.status !== "created") throw new Error("expected created");
    await voteRequest(db, await makeUser(), res.request.id, true);
    delete process.env.REQUEST_PROMOTE_THRESHOLD;
    expect((await eventsFor(requester.id)).map((e) => [e.type, e.points])).toEqual([["course_promoted", 25]]);
  });

  it("clears after 30 days unless frozen, and staff can freeze", async () => {
    const u = await makeUser({ handle: "farmer" });
    const mod = await makeUser({ role: "moderator" });
    const t0 = new Date("2026-06-01T00:00:00Z");
    await awardPoints(db, u.id, "unit_completed", "unit", "x", t0);
    expect(await clearMaturedPoints(db, new Date("2026-06-30T00:00:00Z"))).toBe(0);
    await expect(setPointsFrozen(db, u, "farmer", true)).rejects.toThrow(/moderators/);
    await setPointsFrozen(db, mod, "@farmer", true);
    expect(await clearMaturedPoints(db, new Date("2026-07-02T00:00:00Z"))).toBe(0);
    await setPointsFrozen(db, mod, "farmer", false);
    expect(await clearMaturedPoints(db, new Date("2026-07-02T00:00:00Z"))).toBe(1);
    expect(await pointsSummary(db, u.id)).toEqual({ held: 0, cleared: 3, clawedBack: 0 });
  });

  it("flags pairs of accounts that mostly upvote each other", async () => {
    const s = await courseSetup();
    const a = await makeUser({ handle: "aaa" });
    const b = await makeUser({ handle: "bbb" });
    const t = await createThread(db, a, { courseId: s.course.id }, { title: "Ring question", bodyMd: "?" });
    for (let i = 0; i < 5; i++) {
      const pa = await createPost(db, a, t.id, `a${i}`);
      const pb = await createPost(db, b, t.id, `b${i}`);
      await vote(db, b, "post", pa.id, 1);
      await vote(db, a, "post", pb.id, 1);
    }
    const flags = await collusionFlags(db);
    expect(flags.length).toBe(1);
    expect([flags[0].a, flags[0].b].sort()).toEqual(["aaa", "bbb"]);
    expect(flags[0].a_to_b).toBe(5);
  });
});

describe("affiliate tracking", () => {
  it("links resources to partners, appends tracking params and logs clicks", async () => {
    const s = await courseSetup();
    const admin = await makeUser({ role: "admin" });
    const before = await addResource(db, s.editor, { courseId: s.course.id, url: "https://www.coursera.org/learn/hawaiian", title: "Coursera course" });
    expect(before.partnerId).toBeNull();
    await expect(upsertPartner(db, s.editor, { name: "Coursera", network: "Impact", domain: "coursera.org", payoutEligible: true })).rejects.toThrow(/moderators/);
    await expect(upsertPartner(db, admin, { name: "Bad", network: "Net", domain: "not a domain", payoutEligible: false })).rejects.toThrow(/domain/);
    const p = await upsertPartner(db, admin, {
      name: "Coursera",
      network: "Impact",
      domain: "https://www.coursera.org/",
      trackingParam: "irclickid=umi",
      payoutEligible: true,
    });
    expect(p.domain).toBe("coursera.org");
    const [linked] = await db.select().from(resources).where(eq(resources.id, before.id));
    expect(linked.partnerId).toBe(p.id);
    const after = await addResource(db, s.editor, { courseId: s.course.id, url: "https://coursera.org/learn/other", title: "Another" });
    expect(after.partnerId).toBe(p.id);
    const out = await trackOutbound(db, before.id, s.contributor.id);
    expect(out).toEqual({ url: "https://www.coursera.org/learn/hawaiian?irclickid=umi", tracked: true });
    const plain = await addResource(db, s.editor, { courseId: s.course.id, url: "https://example.org/", title: "Plain" });
    expect(await trackOutbound(db, plain.id, null)).toEqual({ url: "https://example.org/", tracked: false });
    expect((await db.select().from(affiliateClicks)).length).toBe(1);
  });
});

describe("monthly payouts", () => {
  async function partners() {
    const admin = await makeUser({ role: "admin" });
    const eligible = await upsertPartner(db, admin, { name: "Eligible", network: "N1", domain: "eligible.example", payoutEligible: true });
    const other = await upsertPartner(db, admin, { name: "Other", network: "N2", domain: "other.example", payoutEligible: false });
    return { admin, eligible, other };
  }

  it("uses only payout-eligible revenue received in the month, net of reversals", async () => {
    const { admin, eligible, other } = await partners();
    await expect(recordRevenue(db, admin, { partnerId: eligible.id, month: "2026-13", grossCents: 1, reversalsCents: 0, receivedAt: new Date() })).rejects.toThrow(/YYYY-MM/);
    await recordRevenue(db, admin, { partnerId: eligible.id, month: "2026-07", grossCents: 120_000, reversalsCents: 20_000, receivedAt: new Date("2026-07-15T00:00:00Z") });
    await recordRevenue(db, admin, { partnerId: other.id, month: "2026-07", grossCents: 500_000, reversalsCents: 0, receivedAt: new Date("2026-07-20T00:00:00Z") });
    await recordRevenue(db, admin, { partnerId: eligible.id, month: "2026-08", grossCents: 9_999, reversalsCents: 0, receivedAt: new Date("2026-08-02T00:00:00Z") });
    expect(await revenueForMonth(db, "2026-07")).toEqual({ eligibleNetCents: 100_000, ineligibleNetCents: 500_000 });
  });

  it("computes pro-rata payouts with cap, rollover, new-account and frozen exclusions", async () => {
    const { admin, eligible } = await partners();
    await recordRevenue(db, admin, { partnerId: eligible.id, month: "2026-07", grossCents: 200_000, reversalsCents: 0, receivedAt: new Date("2026-07-15T00:00:00Z") });
    const old = new Date("2026-01-01T00:00:00Z");
    const big = await makeUser({ createdAt: old });
    const mids = [];
    for (let i = 0; i < 19; i++) mids.push(await makeUser({ createdAt: old }));
    const tiny = await makeUser({ createdAt: old });
    const newbie = await makeUser({ createdAt: new Date("2026-07-10T00:00:00Z") });
    const frozen = await makeUser({ createdAt: old, pointsFrozen: true });
    const julyDay = new Date("2026-07-05T00:00:00Z");
    for (let i = 0; i < 20; i++) await awardPoints(db, big.id, "polymath_level", "p", String(i), julyDay); // 1000 pts
    for (const m of mids) for (let i = 0; i < 2; i++) await awardPoints(db, m.id, "polymath_level", "p", String(i), julyDay); // 100 each
    await awardPoints(db, tiny.id, "unit_completed", "unit", "t", julyDay); // 3 pts
    await awardPoints(db, newbie.id, "polymath_level", "p", "n", new Date("2026-07-20T00:00:00Z"));
    await awardPoints(db, frozen.id, "polymath_level", "p", "f", julyDay);
    await awardPoints(db, big.id, "polymath_level", "p", "clawed", julyDay);
    await clawBack(db, { type: "polymath_level", sourceType: "p", sourceId: "clawed" });
    await awardPoints(db, big.id, "polymath_level", "p", "june", new Date("2026-06-30T23:00:00Z"));

    await expect(computeMonthlyPayout(db, "2026-07", new Date("2026-07-31T00:00:00Z"))).rejects.toThrow(/not ended/);
    const res = await computeMonthlyPayout(db, "2026-07", new Date("2026-09-02T00:00:00Z"));
    expect(res.period.poolCents).toBe(100_000);
    expect(res.totalPoints).toBe(1000 + 19 * 100 + 3);
    const by = Object.fromEntries(res.allocations.map((a) => [a.userId, a]));
    expect(by[big.id]).toMatchObject({ capped: true, shareCents: 5_000, status: "pending" });
    expect(by[mids[0].id]).toMatchObject({ shareCents: Math.floor((100 / 2903) * 100_000), status: "pending" });
    expect(by[tiny.id]).toMatchObject({ shareCents: 103, status: "rolled_over" });
    expect(by[newbie.id]).toBeUndefined();
    expect(by[frozen.id]).toBeUndefined();
    await expect(computeMonthlyPayout(db, "2026-07", new Date("2026-09-02T00:00:00Z"))).rejects.toThrow(/already computed/);

    // Clawbacks can no longer touch a paid-out month.
    expect(await clawBack(db, { type: "polymath_level", sourceType: "p", sourceId: "0" })).toBe(0);

    // August: tiny's rolled-over balance carries in.
    await recordRevenue(db, admin, { partnerId: eligible.id, month: "2026-08", grossCents: 40_000, reversalsCents: 0, receivedAt: new Date("2026-08-15T00:00:00Z") });
    for (let i = 0; i < 3; i++) await awardPoints(db, tiny.id, "polymath_level", "aug", String(i), new Date("2026-08-05T00:00:00Z"));
    const aug = await computeMonthlyPayout(db, "2026-08", new Date("2026-10-02T00:00:00Z"));
    const t = aug.allocations.find((a) => a.userId === tiny.id)!;
    expect(t.carriedInCents).toBe(103);
    expect(t.status).toBe("pending");
    const tinyRows = await userPayouts(db, tiny.id);
    expect(tinyRows.map((r) => [r.month, r.payout.status])).toEqual([
      ["2026-08", "pending"],
      ["2026-07", "carried"],
    ]);
  });

  it("pays onboarded users through Stripe and waits for the rest", async () => {
    const { admin, eligible } = await partners();
    await recordRevenue(db, admin, { partnerId: eligible.id, month: "2026-07", grossCents: 1_000_000, reversalsCents: 0, receivedAt: new Date("2026-07-15T00:00:00Z") });
    const old = new Date("2026-01-01T00:00:00Z");
    const ready = await makeUser({ createdAt: old, email: "ready@x.test" });
    const notReady = await makeUser({ createdAt: old });
    const fillers = [];
    for (let i = 0; i < 20; i++) fillers.push(await makeUser({ createdAt: old }));
    for (const u of [ready, notReady, ...fillers]) await awardPoints(db, u.id, "approved_edit", "r", u.id, new Date("2026-07-03T00:00:00Z"));
    await computeMonthlyPayout(db, "2026-07", new Date("2026-09-02T00:00:00Z"));

    const transfers: { amountCents: number; destination: string; idempotencyKey: string }[] = [];
    const stripe: StripeClient = {
      createExpressAccount: async ({ userId }) => ({ id: `acct_${userId.slice(0, 8)}` }),
      createAccountLink: async ({ account }) => ({ url: `https://connect.stripe.test/${account}` }),
      retrieveAccount: async (id) => ({ id, payoutsEnabled: true, detailsSubmitted: true }),
      createTransfer: async (t) => {
        transfers.push(t);
        return { id: `tr_${transfers.length}` };
      },
    };
    const url = await startOnboarding(db, ready, stripe, { refresh: "http://x/r", return: "http://x/ret" });
    expect(url).toMatch(/^https:\/\/connect\.stripe\.test\/acct_/);
    expect(await startOnboarding(db, ready, stripe, { refresh: "http://x/r", return: "http://x/ret" })).toBe(url);
    expect((await db.select().from(payoutAccounts)).length).toBe(1);
    expect(await syncOnboarding(db, ready.id, stripe)).toBe("complete");
    expect(await syncOnboarding(db, notReady.id, stripe)).toBeNull();

    const res = await executeTransfers(db, stripe);
    expect(res).toMatchObject({ paid: 1, waitingForOnboarding: 21, failed: 0 });
    expect(transfers[0]).toMatchObject({ amountCents: Math.floor(500_000 / 22), idempotencyKey: expect.stringMatching(/^payout-/) });
    const [paid] = await db.select().from(payouts).where(eq(payouts.userId, ready.id));
    expect(paid).toMatchObject({ status: "paid", stripeTransferId: "tr_1" });
    const again = await executeTransfers(db, stripe);
    expect(again.paid).toBe(0);

    await db.update(users).set({ pointsFrozen: true }).where(eq(users.id, notReady.id));
    const failing: StripeClient = { ...stripe, createTransfer: async () => { throw new Error("insufficient funds"); } };
    await db.insert(payoutAccounts).values({ userId: fillers[0].id, stripeAccountId: "acct_f", onboardingStatus: "complete" });
    const f = await executeTransfers(db, failing);
    expect(f).toMatchObject({ failed: 1, frozen: 1 });
  });

  it("settles the month two months back", () => {
    expect(settleableMonth(new Date("2026-09-02T00:00:00Z"))).toBe("2026-07");
    expect(settleableMonth(new Date("2027-01-02T00:00:00Z"))).toBe("2026-11");
  });
});
