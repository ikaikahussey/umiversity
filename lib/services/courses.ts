import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { courseRoles, courses, domains, fields, lessons, revisions, units, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { requireText, slugify } from "@/lib/text";
import { LEVEL, maybeGrantContributor, requireCourseLevel, type CourseRole } from "./permissions";
import type { AppUser } from "./users";

/** Segments under /c/[course] that are real routes and cannot be unit slugs. */
const RESERVED_UNIT_SLUGS = new Set(["edit", "q", "new", "settings", "cards"]);
/** A course opens once it has this many units with lesson content. */
export const OPEN_UNIT_THRESHOLD = 3;

export async function getCourseBySlug(db: Tx, slug: string) {
  return db.query.courses.findFirst({ where: eq(courses.slug, slug) });
}

export async function requireCourse(db: Tx, slug: string) {
  const c = await getCourseBySlug(db, slug);
  if (!c) throw new AppError("not_found", "Course not found");
  return c;
}

export async function listCourses(db: Tx) {
  return db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      summary: courses.summary,
      status: courses.status,
      fieldName: fields.name,
      fieldSlug: fields.slug,
      domainName: domains.name,
    })
    .from(courses)
    .innerJoin(fields, eq(fields.id, courses.fieldId))
    .innerJoin(domains, eq(domains.id, fields.domainId))
    .where(sql`${courses.status} <> 'archived'`)
    .orderBy(asc(domains.name), asc(fields.name), asc(courses.title));
}

export async function getCourseOutline(db: Tx, courseId: string) {
  const us = await db.select().from(units).where(eq(units.courseId, courseId)).orderBy(asc(units.position));
  const ls = us.length
    ? await db
        .select({
          id: lessons.id,
          unitId: lessons.unitId,
          title: lessons.title,
          slug: lessons.slug,
          position: lessons.position,
          minutes: lessons.minutes,
          hasBody: sql<boolean>`length(${lessons.bodyMd}) > 0`,
        })
        .from(lessons)
        .where(inArray(lessons.unitId, us.map((u) => u.id)))
        .orderBy(asc(lessons.position))
    : [];
  return us.map((u) => ({ ...u, lessons: ls.filter((l) => l.unitId === u.id) }));
}

export async function getLessonBySlugs(db: Tx, courseSlug: string, unitSlug: string, lessonSlug: string) {
  const rows = await db
    .select({ course: courses, unit: units, lesson: lessons })
    .from(lessons)
    .innerJoin(units, eq(units.id, lessons.unitId))
    .innerJoin(courses, eq(courses.id, units.courseId))
    .where(and(eq(courses.slug, courseSlug), eq(units.slug, unitSlug), eq(lessons.slug, lessonSlug)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLessonWithCourse(db: Tx, lessonId: string) {
  const rows = await db
    .select({ course: courses, unit: units, lesson: lessons })
    .from(lessons)
    .innerJoin(units, eq(units.id, lessons.unitId))
    .innerJoin(courses, eq(courses.id, units.courseId))
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!rows[0]) throw new AppError("not_found", "Lesson not found");
  return rows[0];
}

async function uniqueChildSlug(db: Tx, table: "units" | "lessons", parentId: string, base: string) {
  const existing =
    table === "units"
      ? await db.select({ slug: units.slug }).from(units).where(eq(units.courseId, parentId))
      : await db.select({ slug: lessons.slug }).from(lessons).where(eq(lessons.unitId, parentId));
  const taken = new Set(existing.map((r) => r.slug));
  if (table === "units") for (const r of RESERVED_UNIT_SLUGS) taken.add(r);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export async function uniqueCourseSlug(db: Tx, title: string) {
  const base = slugify(title);
  const rows = await db
    .select({ slug: courses.slug })
    .from(courses)
    .where(sql`${courses.slug} = ${base} OR ${courses.slug} LIKE ${base + "-%"}`);
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export async function createUnit(db: Tx, user: AppUser, courseId: string, input: { title: string; summary?: string }) {
  await requireCourseLevel(db, user, courseId, LEVEL.editor, "add units");
  const title = requireText(input.title, "Unit title", 2, 120);
  const [{ pos }] = await db
    .select({ pos: max(units.position) })
    .from(units)
    .where(eq(units.courseId, courseId));
  const slug = await uniqueChildSlug(db, "units", courseId, slugify(title));
  const [u] = await db
    .insert(units)
    .values({ courseId, title, slug, summary: input.summary?.trim() ?? "", position: (pos ?? 0) + 1 })
    .returning();
  return u;
}

export async function createLesson(
  db: Tx,
  user: AppUser,
  unitId: string,
  input: { title: string; minutes?: number },
) {
  const unit = await db.query.units.findFirst({ where: eq(units.id, unitId) });
  if (!unit) throw new AppError("not_found", "Unit not found");
  await requireCourseLevel(db, user, unit.courseId, LEVEL.editor, "add lessons");
  const title = requireText(input.title, "Lesson title", 2, 120);
  const [{ pos }] = await db
    .select({ pos: max(lessons.position) })
    .from(lessons)
    .where(eq(lessons.unitId, unitId));
  const slug = await uniqueChildSlug(db, "lessons", unitId, slugify(title));
  const minutes = Math.min(Math.max(Math.floor(input.minutes ?? 10), 1), 240);
  const [l] = await db
    .insert(lessons)
    .values({ unitId, title, slug, minutes, position: (pos ?? 0) + 1 })
    .returning();
  return l;
}

export type RevisionInput = { title?: string; bodyMd: string; summary?: string };

export async function proposeRevision(db: Tx, user: AppUser, lessonId: string, input: RevisionInput) {
  const { course, lesson } = await getLessonWithCourse(db, lessonId);
  await requireCourseLevel(db, user, course.id, LEVEL.contributor, "propose lesson edits");
  const title = requireText(input.title ?? lesson.title, "Title", 2, 120);
  const bodyMd = typeof input.bodyMd === "string" ? input.bodyMd.replace(/\r\n?/g, "\n") : "";
  if (bodyMd.length > 100_000) throw new AppError("invalid", "Lesson text is too long");
  if (bodyMd === lesson.bodyMd && title === lesson.title) {
    throw new AppError("invalid", "The proposal does not change the lesson");
  }
  const [rev] = await db
    .insert(revisions)
    .values({
      lessonId,
      authorId: user.id,
      title,
      bodyMd,
      summary: (input.summary ?? "").trim().slice(0, 300),
      baseRevisionId: lesson.currentRevisionId,
    })
    .returning();
  return rev;
}

export type ReviewResult = { revision: typeof revisions.$inferSelect; courseOpened: boolean };

export async function reviewRevision(
  db: Tx,
  user: AppUser,
  revisionId: string,
  decision: "approve" | "reject",
): Promise<ReviewResult> {
  const rev = await db.query.revisions.findFirst({ where: eq(revisions.id, revisionId) });
  if (!rev) throw new AppError("not_found", "Revision not found");
  if (rev.status !== "proposed") throw new AppError("conflict", "This revision was already reviewed");
  const { course } = await getLessonWithCourse(db, rev.lessonId);
  const level = await requireCourseLevel(db, user, course.id, LEVEL.editor, "review edits");
  if (rev.authorId === user.id && decision === "approve" && level < LEVEL.steward) {
    throw new AppError("forbidden", "Another editor must approve your own edit");
  }
  const now = new Date();
  const [updated] = await db
    .update(revisions)
    .set({ status: decision === "approve" ? "approved" : "rejected", reviewerId: user.id, reviewedAt: now })
    .where(and(eq(revisions.id, rev.id), eq(revisions.status, "proposed")))
    .returning();
  if (!updated) throw new AppError("conflict", "This revision was already reviewed");
  let courseOpened = false;
  if (decision === "approve") {
    await db
      .update(lessons)
      .set({ title: rev.title, bodyMd: rev.bodyMd, currentRevisionId: rev.id })
      .where(eq(lessons.id, rev.lessonId));
    courseOpened = await maybeOpenCourse(db, course.id);
    if (rev.authorId !== user.id) await maybeGrantContributor(db, rev.authorId, course.id);
  }
  return { revision: updated, courseOpened };
}

/** Restores a lesson to an earlier approved revision by recording a new approved revision. */
export async function revertLesson(db: Tx, user: AppUser, lessonId: string, toRevisionId: string) {
  const { course, lesson } = await getLessonWithCourse(db, lessonId);
  await requireCourseLevel(db, user, course.id, LEVEL.steward, "revert lessons");
  const target = await db.query.revisions.findFirst({
    where: and(eq(revisions.id, toRevisionId), eq(revisions.lessonId, lessonId)),
  });
  if (!target || target.status !== "approved") throw new AppError("invalid", "Can only revert to an approved revision");
  if (target.id === lesson.currentRevisionId) throw new AppError("invalid", "That revision is already current");
  const now = new Date();
  const [rev] = await db
    .insert(revisions)
    .values({
      lessonId,
      authorId: user.id,
      title: target.title,
      bodyMd: target.bodyMd,
      summary: `Revert to revision of ${target.createdAt.toISOString().slice(0, 10)}`,
      baseRevisionId: lesson.currentRevisionId,
      status: "approved",
      reviewerId: user.id,
      reviewedAt: now,
      revertOfId: target.id,
    })
    .returning();
  await db
    .update(lessons)
    .set({ title: target.title, bodyMd: target.bodyMd, currentRevisionId: rev.id })
    .where(eq(lessons.id, lessonId));
  return { revision: rev, reverted: await revisionsSupersededBy(db, lessonId, target) };
}

/** Approved, non-revert revisions made after `target` on the same lesson: the edits a revert undoes. */
async function revisionsSupersededBy(db: Tx, lessonId: string, target: typeof revisions.$inferSelect) {
  return db
    .select()
    .from(revisions)
    .where(
      and(
        eq(revisions.lessonId, lessonId),
        eq(revisions.status, "approved"),
        sql`${revisions.revertOfId} IS NULL`,
        sql`${revisions.reviewedAt} > ${target.reviewedAt ?? target.createdAt}`,
      ),
    );
}

export async function listRevisions(db: Tx, lessonId: string) {
  return db
    .select({ revision: revisions, authorHandle: users.handle, authorName: users.name })
    .from(revisions)
    .innerJoin(users, eq(users.id, revisions.authorId))
    .where(eq(revisions.lessonId, lessonId))
    .orderBy(desc(revisions.createdAt));
}

export async function listPendingRevisions(db: Tx, courseId: string) {
  return db
    .select({
      revision: revisions,
      lessonTitle: lessons.title,
      lessonBody: lessons.bodyMd,
      lessonSlug: lessons.slug,
      unitSlug: units.slug,
      authorHandle: users.handle,
    })
    .from(revisions)
    .innerJoin(lessons, eq(lessons.id, revisions.lessonId))
    .innerJoin(units, eq(units.id, lessons.unitId))
    .innerJoin(users, eq(users.id, revisions.authorId))
    .where(and(eq(units.courseId, courseId), eq(revisions.status, "proposed")))
    .orderBy(asc(revisions.createdAt));
}

/** Moves a draft course to Open once enough units have lesson content. */
export async function maybeOpenCourse(db: Tx, courseId: string): Promise<boolean> {
  const res = await db.execute<{ n: string }>(sql`
    SELECT count(DISTINCT u.id) AS n
    FROM units u JOIN lessons l ON l.unit_id = u.id
    WHERE u.course_id = ${courseId} AND length(trim(l.body_md)) > 0`);
  if (Number(res.rows[0]?.n ?? 0) < OPEN_UNIT_THRESHOLD) return false;
  const updated = await db
    .update(courses)
    .set({ status: "open" })
    .where(and(eq(courses.id, courseId), eq(courses.status, "draft")))
    .returning({ id: courses.id });
  return updated.length > 0;
}

export async function assignCourseRole(
  db: Tx,
  user: AppUser,
  courseId: string,
  targetHandle: string,
  role: CourseRole | "none",
) {
  const level = await requireCourseLevel(db, user, courseId, LEVEL.steward, "assign roles");
  const target = await db.query.users.findFirst({
    where: sql`lower(${users.handle}) = ${targetHandle.trim().replace(/^@/, "").toLowerCase()}`,
  });
  if (!target) throw new AppError("not_found", "No user with that handle");
  if (!["steward", "editor", "contributor", "none"].includes(role)) throw new AppError("invalid", "Unknown role");
  if (target.id === user.id && level < LEVEL.moderator) {
    throw new AppError("forbidden", "Ask another steward or a moderator to change your own role");
  }
  if (role === "none") {
    await db.delete(courseRoles).where(and(eq(courseRoles.courseId, courseId), eq(courseRoles.userId, target.id)));
  } else {
    await db
      .insert(courseRoles)
      .values({ courseId, userId: target.id, role })
      .onConflictDoUpdate({ target: [courseRoles.courseId, courseRoles.userId], set: { role } });
  }
  return target;
}

export async function listCourseRoles(db: Tx, courseId: string) {
  return db
    .select({ role: courseRoles.role, handle: users.handle, name: users.name, userId: users.id })
    .from(courseRoles)
    .innerJoin(users, eq(users.id, courseRoles.userId))
    .where(eq(courseRoles.courseId, courseId))
    .orderBy(asc(courseRoles.role), asc(users.handle));
}

export async function updateCourseOverview(
  db: Tx,
  user: AppUser,
  courseId: string,
  input: { summary: string; overviewMd: string; keywords?: string },
) {
  await requireCourseLevel(db, user, courseId, LEVEL.editor, "edit the course overview");
  const summary = requireText(input.summary, "Summary", 0, 300);
  if (input.overviewMd.length > 20_000) throw new AppError("invalid", "Overview is too long");
  const [c] = await db
    .update(courses)
    .set({ summary, overviewMd: input.overviewMd, keywords: (input.keywords ?? "").slice(0, 300) })
    .where(eq(courses.id, courseId))
    .returning();
  return c;
}
