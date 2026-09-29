import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { courses, dailyCards, domains, fields, lessons, revisions, units, users } from "@/db/schema";
import { LAUNCH_COURSES } from "@/db/seed/courses";
import { TAXONOMY } from "@/db/seed/taxonomy";
import { maybeOpenCourse } from "./courses";

export const SYSTEM_USER_ID = "system";

/** Inserts domains and fields; safe to run repeatedly. */
export async function seedTaxonomy(db: Tx) {
  for (const d of TAXONOMY) {
    await db.insert(domains).values({ name: d.domain, slug: d.slug }).onConflictDoNothing();
    const [dom] = await db.select().from(domains).where(eq(domains.slug, d.slug));
    for (const f of d.fields) {
      await db
        .insert(fields)
        .values({ domainId: dom.id, name: f.name, slug: f.slug })
        .onConflictDoNothing();
    }
  }
}

export async function ensureSystemUser(db: Tx) {
  await db
    .insert(users)
    .values({ id: SYSTEM_USER_ID, handle: "umiversity", name: "Umiversity", role: "admin" })
    .onConflictDoNothing();
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Creates the launch courses with units, lessons and initial revisions if missing. */
export async function seedLaunchCourses(db: Tx, today = new Date().toISOString().slice(0, 10)) {
  await ensureSystemUser(db);
  for (const sc of LAUNCH_COURSES) {
    const field = await db.query.fields.findFirst({ where: eq(fields.slug, sc.fieldSlug) });
    if (!field) throw new Error(`missing field ${sc.fieldSlug}; seed taxonomy first`);
    let course = await db.query.courses.findFirst({ where: eq(courses.slug, sc.slug) });
    if (!course) {
      [course] = await db
        .insert(courses)
        .values({
          fieldId: field.id,
          title: sc.title,
          slug: sc.slug,
          summary: sc.summary,
          overviewMd: sc.overview,
          keywords: sc.keywords,
          status: "draft",
        })
        .returning();
    }
    for (const [ui, su] of sc.units.entries()) {
      let unit = await db.query.units.findFirst({
        where: and(eq(units.courseId, course.id), eq(units.slug, su.slug)),
      });
      if (!unit) {
        [unit] = await db
          .insert(units)
          .values({ courseId: course.id, slug: su.slug, title: su.title, summary: su.summary, position: ui + 1 })
          .returning();
      }
      for (const [li, sl] of su.lessons.entries()) {
        const exists = await db.query.lessons.findFirst({
          where: and(eq(lessons.unitId, unit.id), eq(lessons.slug, sl.slug)),
        });
        if (exists) continue;
        const [lesson] = await db
          .insert(lessons)
          .values({ unitId: unit.id, slug: sl.slug, title: sl.title, bodyMd: sl.body, minutes: sl.minutes, position: li + 1 })
          .returning();
        const [rev] = await db
          .insert(revisions)
          .values({
            lessonId: lesson.id,
            authorId: SYSTEM_USER_ID,
            title: sl.title,
            bodyMd: sl.body,
            summary: "Initial seed content",
            status: "approved",
            reviewerId: SYSTEM_USER_ID,
            reviewedAt: new Date(),
          })
          .returning();
        await db.update(lessons).set({ currentRevisionId: rev.id }).where(eq(lessons.id, lesson.id));
      }
    }
    for (const [i, card] of sc.cards.entries()) {
      await db
        .insert(dailyCards)
        .values({
          courseId: course.id,
          kind: card.kind,
          body: card.body,
          answer: card.answer ?? null,
          scheduledFor: addDays(today, i),
          authorId: SYSTEM_USER_ID,
        })
        .onConflictDoNothing();
    }
    await maybeOpenCourse(db, course.id);
  }
}

/** Everything a fresh environment needs. */
export async function seedAll(db: Tx) {
  await seedTaxonomy(db);
  await seedLaunchCourses(db);
}
