import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { courses, domains, fields, lessons, units } from "@/db/schema";
import { search } from "@/lib/services/search";
import { seedTaxonomy } from "@/lib/services/seed";
import { ensureUser, generateHandle, getUserByHandle, updateProfile } from "@/lib/services/users";
import { makeField, makeUser, resetDb, testDb as db } from "../helpers/db";

beforeEach(resetDb);

describe("app_normalize (database)", () => {
  it("matches the TypeScript normalizer", async () => {
    const res = await db.execute<{ v: string }>(sql`SELECT app_normalize(${"ʻŌlelo Hawaiʻi Ā ē"}) AS v`);
    expect(res.rows[0].v).toBe("olelo hawaii a e");
  });
});

describe("seedTaxonomy", () => {
  it("is idempotent", async () => {
    await seedTaxonomy(db);
    await seedTaxonomy(db);
    const d = await db.select().from(domains);
    const f = await db.select().from(fields);
    expect(d.map((x) => x.name).sort()).toEqual(["Arts", "Humanities", "Languages", "Practical Skills", "Sciences"]);
    expect(f.length).toBeGreaterThanOrEqual(20);
    expect(f.some((x) => x.slug === "hawaiian-language")).toBe(true);
  });
});

describe("users", () => {
  it("creates a profile on first sign-in and returns it afterwards", async () => {
    const a = await ensureUser(db, { id: "auth-1", name: "Keola Kahale", email: "k@example.com" });
    expect(a.handle).toBe("keolakahale");
    expect(a.role).toBe("member");
    const b = await ensureUser(db, { id: "auth-1", name: "Changed" });
    expect(b.name).toBe("Keola Kahale");
  });

  it("allocates unique handles", async () => {
    await ensureUser(db, { id: "a", name: "Lei" });
    const second = await ensureUser(db, { id: "b", name: "Lei" });
    expect(second.handle).toBe("lei2");
    expect(await generateHandle(db, { id: "c", email: "pua@x.org" })).toBe("pua");
    expect(await generateHandle(db, { id: "d", name: "Al" })).toBe("allearner");
  });

  it("strips diacritics from derived handles", async () => {
    const u = await ensureUser(db, { id: "x", name: "Kūhiō Nāone" });
    expect(u.handle).toBe("kuhionaone");
  });

  it("looks up handles case-insensitively", async () => {
    await makeUser({ handle: "Makana" });
    expect((await getUserByHandle(db, "makana"))?.handle).toBe("Makana");
  });

  it("validates profile updates", async () => {
    const u = await makeUser();
    await makeUser({ handle: "taken" });
    await expect(updateProfile(db, u.id, { handle: "TAKEN" })).rejects.toThrow(/taken/);
    await expect(updateProfile(db, u.id, { handle: "a" })).rejects.toThrow(/Handle/);
    await expect(updateProfile(db, u.id, { timezone: "Mars/Base" })).rejects.toThrow(/timezone/);
    await expect(updateProfile(db, u.id, { reminderHour: 25 })).rejects.toThrow(/Reminder/);
    await expect(updateProfile(db, u.id, { weeklyGoalTarget: 0 })).rejects.toThrow(/Goal/);
    const updated = await updateProfile(db, u.id, {
      handle: "Newname",
      timezone: "America/New_York",
      weeklyGoalType: "minutes",
      weeklyGoalTarget: 90,
      reminderHour: 7,
    });
    expect(updated.handle).toBe("newname");
    expect(updated.weeklyGoalTarget).toBe(90);
  });
});

describe("search", () => {
  async function seedCourse() {
    const { field } = await makeField("Hawaiian Language");
    const [c] = await db
      .insert(courses)
      .values({ fieldId: field.id, title: "ʻŌlelo Hawaiʻi", slug: "olelo-hawaii", summary: "The Hawaiian language" })
      .returning();
    const [u] = await db.insert(units).values({ courseId: c.id, position: 1, slug: "pi-apa", title: "Ka Pīʻāpā" }).returning();
    await db.insert(lessons).values({
      unitId: u.id,
      position: 1,
      slug: "vowels",
      title: "Nā Woela",
      bodyMd: "Long vowels carry a kahakō: ā ē ī ō ū. The ʻokina is a glottal stop.",
    });
    return c;
  }

  it("matches with or without ʻokina and kahakō", async () => {
    await seedCourse();
    for (const q of ["olelo", "ʻŌlelo", "Olelo Hawaii", "Hawaiʻi", "hawai'i", "OLELO"]) {
      const hits = await search(db, q);
      expect(hits.some((h) => h.kind === "course" && h.href === "/c/olelo-hawaii"), q).toBe(true);
    }
  });

  it("finds lessons by folded body and title text", async () => {
    await seedCourse();
    const a = await search(db, "kahako");
    expect(a.find((h) => h.kind === "lesson")?.href).toBe("/c/olelo-hawaii/pi-apa/vowels");
    const b = await search(db, "okina");
    expect(b.some((h) => h.kind === "lesson")).toBe(true);
    const c = await search(db, "woela");
    expect(c.some((h) => h.kind === "lesson")).toBe(true);
  });

  it("supports prefix matching and ignores empty queries", async () => {
    await seedCourse();
    expect((await search(db, "haw")).length).toBeGreaterThan(0);
    expect(await search(db, "   ")).toEqual([]);
    expect(await search(db, "zzzz")).toEqual([]);
  });

  it("excludes archived courses", async () => {
    const c = await seedCourse();
    await db.execute(sql`UPDATE courses SET status = 'archived' WHERE id = ${c.id}`);
    expect(await search(db, "olelo")).toEqual([]);
  });
});
