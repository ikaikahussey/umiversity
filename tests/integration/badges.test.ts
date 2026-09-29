import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { badges, courseRoles, courses } from "@/db/schema";
import {
  canViewEvidence,
  endorseBadge,
  listUserBadges,
  pendingBadgeQueue,
  purgeExpiredEvidence,
  reviewBadge,
  setBadgeDisplay,
  submitBadge,
  type EvidenceStore,
} from "@/lib/services/badges";
import { listNotifications } from "@/lib/services/notifications";
import { makeField, makeUser, resetDb, testDb as db } from "../helpers/db";

beforeEach(resetDb);

function memoryStore() {
  const files = new Map<string, number>();
  const store: EvidenceStore = {
    put: async (path, f) => {
      files.set(path, f.size);
      return path;
    },
    del: async (path) => {
      files.delete(path);
    },
  };
  return { files, store };
}

const pdf = (size = 1000) => ({ name: "diploma.pdf", type: "application/pdf", size, data: new ArrayBuffer(size) });

describe("degree and credential badges", () => {
  it("requires private evidence and admin review", async () => {
    const { field } = await makeField("Hawaiian Language");
    const u = await makeUser();
    const admin = await makeUser({ role: "admin" });
    const { files, store } = memoryStore();
    await expect(submitBadge(db, u, { type: "degree", fieldId: field.id, label: "MA, Hawaiian Language" }, store)).rejects.toThrow(/Upload/);
    await expect(
      submitBadge(db, u, { type: "degree", fieldId: field.id, label: "MA Hawaiian", evidence: { ...pdf(), type: "text/html" } }, store),
    ).rejects.toThrow(/PDF, JPEG or PNG/);
    await expect(
      submitBadge(db, u, { type: "degree", fieldId: field.id, label: "MA Hawaiian", evidence: pdf(6 * 1024 * 1024) }, store),
    ).rejects.toThrow(/5 MB/);
    const b = await submitBadge(
      db,
      u,
      { type: "degree", fieldId: field.id, label: "MA, Hawaiian Language — UH Mānoa", details: "2019", evidence: pdf() },
      store,
    );
    expect(b.status).toBe("pending");
    expect(b.evidenceBlobUrl).toBe(`badge-evidence/${u.id}/${b.id}.pdf`);
    expect(files.has(b.evidenceBlobUrl!)).toBe(true);
    expect(await listUserBadges(db, u.id, true)).toEqual([]);
    expect(await canViewEvidence(db, u, b.id)).toBe(false);
    expect(await canViewEvidence(db, admin, b.id)).toBe(true);
    expect((await pendingBadgeQueue(db)).length).toBe(1);

    await expect(reviewBadge(db, u, b.id, "verify")).rejects.toThrow(/own badge/);
    const other = await makeUser();
    await expect(reviewBadge(db, other, b.id, "verify")).rejects.toThrow(/cannot review/);
    const decidedAt = new Date("2026-09-01T00:00:00Z");
    const v = await reviewBadge(db, admin, b.id, "verify", decidedAt);
    expect(v.status).toBe("verified");
    expect(v.evidenceDeleteAfter?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect((await listUserBadges(db, u.id, true)).map((x) => x.badge.label)).toEqual(["MA, Hawaiian Language — UH Mānoa"]);
    expect((await listNotifications(db, u.id))[0].body).toContain("verified");

    await setBadgeDisplay(db, u, b.id, false);
    expect(await listUserBadges(db, u.id, true)).toEqual([]);
    await expect(setBadgeDisplay(db, other, b.id, true)).rejects.toThrow(/not found/);

    expect(await purgeExpiredEvidence(db, store, new Date("2026-09-20T00:00:00Z"))).toBe(0);
    expect(await purgeExpiredEvidence(db, store, new Date("2026-10-02T00:00:00Z"))).toBe(1);
    expect(files.size).toBe(0);
    const [after] = await db.select().from(badges).where(eq(badges.id, b.id));
    expect(after.evidenceBlobUrl).toBeNull();
  });

  it("limits pending submissions per user", async () => {
    const { field } = await makeField("Law and Government", "Humanities");
    const u = await makeUser();
    const { store } = memoryStore();
    for (let i = 0; i < 5; i++) {
      await submitBadge(db, u, { type: "credential", fieldId: field.id, label: `License ${i}`, evidence: pdf() }, store);
    }
    await expect(
      submitBadge(db, u, { type: "credential", fieldId: field.id, label: "License 6", evidence: pdf() }, store),
    ).rejects.toThrow(/5 badges waiting/);
  });
});

describe("community-recognized badges", () => {
  it("needs three endorsements from field badge holders, then a steward in the field", async () => {
    const { field } = await makeField("Dance", "Arts");
    const { field: otherField } = await makeField("Physics", "Sciences");
    const [course] = await db.insert(courses).values({ fieldId: field.id, title: "Hula", slug: "hula" }).returning();
    const [otherCourse] = await db.insert(courses).values({ fieldId: otherField.id, title: "Physics", slug: "physics" }).returning();
    const claimant = await makeUser();
    const steward = await makeUser();
    const wrongSteward = await makeUser();
    await db.insert(courseRoles).values([
      { courseId: course.id, userId: steward.id, role: "steward" },
      { courseId: otherCourse.id, userId: wrongSteward.id, role: "steward" },
    ]);
    const holders = [];
    for (let i = 0; i < 3; i++) {
      const h = await makeUser();
      await db.insert(badges).values({ userId: h.id, type: "community", fieldId: field.id, label: "Kumu hula", status: "verified" });
      holders.push(h);
    }
    const outsider = await makeUser();
    const { store } = memoryStore();
    const b = await submitBadge(db, claimant, { type: "community", fieldId: field.id, label: "Kumu hula" }, store);
    expect(b.evidenceBlobUrl).toBeNull();
    await expect(endorseBadge(db, outsider, b.id)).rejects.toThrow(/verified badge holders/);
    await expect(endorseBadge(db, claimant, b.id)).rejects.toThrow(/yourself/);
    await endorseBadge(db, holders[0], b.id);
    await endorseBadge(db, holders[0], b.id);
    expect(await endorseBadge(db, holders[1], b.id)).toBe(2);
    await expect(reviewBadge(db, steward, b.id, "verify")).rejects.toThrow(/3 endorsements/);
    await endorseBadge(db, holders[2], b.id);
    await expect(reviewBadge(db, wrongSteward, b.id, "verify")).rejects.toThrow(/cannot review/);
    const v = await reviewBadge(db, steward, b.id, "verify");
    expect(v.status).toBe("verified");
    await expect(reviewBadge(db, steward, b.id, "reject")).rejects.toThrow(/already decided/);
  });

  it("does not let stewards review degrees", async () => {
    const { field } = await makeField("Dance", "Arts");
    const [course] = await db.insert(courses).values({ fieldId: field.id, title: "Hula", slug: "hula2" }).returning();
    const steward = await makeUser();
    await db.insert(courseRoles).values({ courseId: course.id, userId: steward.id, role: "steward" });
    const u = await makeUser();
    const { store } = memoryStore();
    const b = await submitBadge(db, u, { type: "degree", fieldId: field.id, label: "BA Dance", evidence: pdf() }, store);
    await expect(reviewBadge(db, steward, b.id, "verify")).rejects.toThrow(/cannot review/);
  });
});
