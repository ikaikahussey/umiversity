import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { courseRequests, courseRoles, courses, requestVotes } from "@/db/schema";
import { countLastDay, DAILY_LIMITS } from "@/lib/services/rate-limit";
import {
  findSimilar,
  getRequestDetail,
  listRequests,
  mergeRequest,
  promoteRequest,
  promoteThreshold,
  rejectRequest,
  submitRequest,
  voteRequest,
} from "@/lib/services/requests";
import { makeField, makeUser, resetDb, testDb as db } from "../helpers/db";

const DESC = "A course covering the fundamentals, history and practice of this subject.";

beforeEach(async () => {
  await resetDb();
  process.env.REQUEST_PROMOTE_THRESHOLD = "3";
});
afterEach(() => {
  delete process.env.REQUEST_PROMOTE_THRESHOLD;
});

async function submit(user: Awaited<ReturnType<typeof makeUser>>, fieldId: string, title: string, confirm = false) {
  const res = await submitRequest(db, user, { title, description: DESC, fieldId, confirmNotDuplicate: confirm });
  if (res.status !== "created") throw new Error("expected created");
  return res.request;
}

describe("threshold", () => {
  it("defaults to 25 and reads the env override", () => {
    delete process.env.REQUEST_PROMOTE_THRESHOLD;
    expect(promoteThreshold()).toBe(25);
    process.env.REQUEST_PROMOTE_THRESHOLD = "7";
    expect(promoteThreshold()).toBe(7);
    process.env.REQUEST_PROMOTE_THRESHOLD = "abc";
    expect(promoteThreshold()).toBe(25);
  });
});

describe("submitRequest", () => {
  it("validates input and counts the requester's vote", async () => {
    const { field } = await makeField("Mathematics", "Sciences");
    const u = await makeUser();
    await expect(submitRequest(db, u, { title: "x", description: DESC, fieldId: field.id })).rejects.toThrow(/Title/);
    await expect(submitRequest(db, u, { title: "Calculus", description: "short", fieldId: field.id })).rejects.toThrow(/Description/);
    await expect(
      submitRequest(db, u, { title: "Calculus", description: DESC, fieldId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toThrow(/field/);
    const r = await submit(u, field.id, "Calculus I");
    expect(r.voteCount).toBe(1);
    expect(r.status).toBe("open");
  });

  it("shows near-duplicates before submitting, ignoring diacritics", async () => {
    const { field } = await makeField("Dance", "Arts");
    const a = await makeUser();
    const b = await makeUser();
    await submit(a, field.id, "Hula Kahiko");
    const res = await submitRequest(db, b, { title: "hula kahiko basics", description: DESC, fieldId: field.id });
    expect(res.status).toBe("duplicates");
    if (res.status === "duplicates") expect(res.matches[0].title).toBe("Hula Kahiko");
    const res2 = await submitRequest(db, b, { title: "Hula Kāhiko", description: DESC, fieldId: field.id });
    expect(res2.status).toBe("duplicates");
    const forced = await submitRequest(db, b, {
      title: "hula kahiko basics",
      description: DESC,
      fieldId: field.id,
      confirmNotDuplicate: true,
    });
    expect(forced.status).toBe("created");
  });

  it("matches existing course titles too", async () => {
    const { field } = await makeField("Hawaiian Language");
    await db.insert(courses).values({ fieldId: field.id, title: "ʻŌlelo Hawaiʻi", slug: "olelo-hawaii" });
    const m = await findSimilar(db, "Olelo Hawaii");
    expect(m[0]).toMatchObject({ kind: "course", href: "/c/olelo-hawaii" });
    expect(await findSimilar(db, "Quantum chromodynamics")).toEqual([]);
  });

  it("enforces 10 requests per day", async () => {
    const { field } = await makeField("Physics", "Sciences");
    const u = await makeUser();
    const titles = ["Optics", "Thermodynamics", "Relativity", "Acoustics", "Plasma", "Crystallography", "Fluids", "Cosmology", "Magnetism", "Nuclear"];
    for (const t of titles) await submit(u, field.id, t, true);
    expect(await countLastDay(db, u.id, "requests")).toBe(DAILY_LIMITS.requests);
    await expect(submit(u, field.id, "Particle Physics", true)).rejects.toThrow(/Daily limit/);
  });
});

describe("voting and promotion", () => {
  it("allows one vote per user and promotes at the threshold", async () => {
    const { field } = await makeField("History", "Humanities");
    const requester = await makeUser();
    const v1 = await makeUser();
    const v2 = await makeUser();
    const late = await makeUser();
    const r = await submit(requester, field.id, "History of Polynesian Navigation");
    let res = await voteRequest(db, v1, r.id, true);
    expect(res.voteCount).toBe(2);
    res = await voteRequest(db, v1, r.id, true);
    expect(res.voteCount).toBe(2);
    await expect(voteRequest(db, requester, r.id, false)).rejects.toThrow(/requester/);
    res = await voteRequest(db, v1, r.id, false);
    expect(res.voteCount).toBe(1);
    await voteRequest(db, v1, r.id, true);
    res = await voteRequest(db, v2, r.id, true);
    expect(res.voteCount).toBe(3);
    expect(res.promotedCourseSlug).toBe("history-of-polynesian-navigation");

    const [req] = await db.select().from(courseRequests).where(eq(courseRequests.id, r.id));
    expect(req.status).toBe("promoted");
    const course = await db.query.courses.findFirst({ where: eq(courses.id, req.courseId!) });
    expect(course).toMatchObject({ status: "draft", requestId: r.id, fieldId: field.id });
    const roles = await db.select().from(courseRoles).where(eq(courseRoles.courseId, course!.id));
    expect(roles.map((x) => x.userId).sort()).toEqual([requester.id, v1.id, v2.id].sort());
    expect(roles.every((x) => x.role === "editor")).toBe(true);
    await expect(voteRequest(db, late, r.id, true)).rejects.toThrow(/closed/);
  });

  it("promotion is idempotent", async () => {
    process.env.REQUEST_PROMOTE_THRESHOLD = "100";
    const { field } = await makeField("Music", "Arts");
    const u = await makeUser();
    const mod = await makeUser({ role: "moderator" });
    const r = await submit(u, field.id, "Slack Key Guitar");
    await expect(promoteRequest(db, r.id, u)).rejects.toThrow(/moderators/);
    const c1 = await promoteRequest(db, r.id, mod);
    const c2 = await promoteRequest(db, r.id, mod);
    expect(c1?.slug).toBe("slack-key-guitar");
    expect(c2).toBeNull();
    expect((await db.select().from(courses)).length).toBe(1);
  });

  it("limits founding editors to the requester and the earliest voters", async () => {
    process.env.REQUEST_PROMOTE_THRESHOLD = "7";
    const { field } = await makeField("Biology", "Sciences");
    const requester = await makeUser();
    const r = await submit(requester, field.id, "Marine Biology of Hawaiʻi");
    const voters = [];
    for (let i = 0; i < 6; i++) {
      const v = await makeUser();
      voters.push(v);
      await db.insert(requestVotes).values({ requestId: r.id, userId: v.id, createdAt: new Date(Date.now() - (10 - i) * 60000) });
    }
    await db.update(courseRequests).set({ voteCount: 7 }).where(eq(courseRequests.id, r.id));
    const course = await promoteRequest(db, r.id, null);
    const roles = await db.select().from(courseRoles).where(eq(courseRoles.courseId, course!.id));
    expect(roles.length).toBe(5);
    expect(roles.map((x) => x.userId).sort()).toEqual([requester.id, ...voters.slice(0, 4).map((v) => v.id)].sort());
  });
});

describe("moderation", () => {
  it("merges duplicate requests, combining votes", async () => {
    process.env.REQUEST_PROMOTE_THRESHOLD = "10";
    const { field } = await makeField("Cooking", "Practical Skills");
    const a = await makeUser();
    const b = await makeUser();
    const c = await makeUser();
    const mod = await makeUser({ role: "moderator" });
    const target = await submit(a, field.id, "Hawaiian Cooking");
    const source = await submit(b, field.id, "Cooking Hawaiian Food", true);
    await voteRequest(db, c, source.id, true);
    await voteRequest(db, c, target.id, true);
    await expect(mergeRequest(db, a, source.id, target.id)).rejects.toThrow(/moderators/);
    await mergeRequest(db, mod, source.id, target.id);
    const detail = await getRequestDetail(db, target.id, c.id);
    expect(detail?.request.voteCount).toBe(3);
    expect(detail?.voted).toBe(true);
    expect(detail?.mergedFrom.map((m) => m.id)).toEqual([source.id]);
    const src = await getRequestDetail(db, source.id);
    expect(src?.request.status).toBe("merged");
    expect(src?.mergedInto?.id).toBe(target.id);
    await expect(voteRequest(db, c, source.id, true)).rejects.toThrow(/closed/);
  });

  it("rejects off-topic requests and hides them from the board", async () => {
    const { field } = await makeField("Writing", "Arts");
    const u = await makeUser();
    const mod = await makeUser({ role: "admin" });
    const r = await submit(u, field.id, "Buy my stuff now");
    await rejectRequest(db, mod, r.id);
    await expect(rejectRequest(db, mod, r.id)).rejects.toThrow(/open/);
    expect(await listRequests(db, "top")).toEqual([]);
  });

  it("sorts the board by votes or by date", async () => {
    process.env.REQUEST_PROMOTE_THRESHOLD = "50";
    const { field } = await makeField("Philosophy", "Humanities");
    const u1 = await makeUser();
    const u2 = await makeUser();
    const older = await submit(u1, field.id, "Stoicism");
    await db.update(courseRequests).set({ createdAt: new Date(Date.now() - 3600_000) }).where(eq(courseRequests.id, older.id));
    await submit(u2, field.id, "Epistemology");
    await voteRequest(db, u2, older.id, true);
    expect((await listRequests(db, "top")).map((r) => r.title)).toEqual(["Stoicism", "Epistemology"]);
    expect((await listRequests(db, "new")).map((r) => r.title)).toEqual(["Epistemology", "Stoicism"]);
  });
});
