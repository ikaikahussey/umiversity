import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { courseRoles, courses, lessons, posts, revisions, threads } from "@/db/schema";
import {
  assignCourseRole,
  createLesson,
  createUnit,
  getCourseOutline,
  getLessonBySlugs,
  listPendingRevisions,
  listRevisions,
  maybeOpenCourse,
  proposeRevision,
  requireCourse,
  revertLesson,
  reviewRevision,
} from "@/lib/services/courses";
import { courseLevel, LEVEL } from "@/lib/services/permissions";
import { seedAll } from "@/lib/services/seed";
import { search } from "@/lib/services/search";
import { makeField, makeUser, resetDb, testDb as db } from "../helpers/db";

beforeEach(resetDb);

async function setupCourse() {
  const { field } = await makeField("History", "Humanities");
  const [course] = await db
    .insert(courses)
    .values({ fieldId: field.id, title: "Test Course", slug: "test-course" })
    .returning();
  const steward = await makeUser();
  const editor = await makeUser();
  const contributor = await makeUser();
  const member = await makeUser();
  await db.insert(courseRoles).values([
    { courseId: course.id, userId: steward.id, role: "steward" },
    { courseId: course.id, userId: editor.id, role: "editor" },
    { courseId: course.id, userId: contributor.id, role: "contributor" },
  ]);
  return { course, steward, editor, contributor, member };
}

describe("seed", () => {
  it("creates both launch courses as Open with units and lessons, idempotently", async () => {
    await seedAll(db);
    await seedAll(db);
    const olelo = await requireCourse(db, "olelo-hawaii");
    const moolelo = await requireCourse(db, "moolelo-hawaii");
    expect(olelo.title).toBe("ʻŌlelo Hawaiʻi");
    expect(moolelo.title).toBe("Moʻolelo Hawaiʻi");
    expect(olelo.status).toBe("open");
    expect(moolelo.status).toBe("open");
    const outline = await getCourseOutline(db, olelo.id);
    expect(outline.length).toBe(4);
    expect(outline[0].lessons.map((l) => l.slug)).toEqual(["na-woela", "na-koneka", "ke-kahako"]);
    const lesson = await getLessonBySlugs(db, "olelo-hawaii", "ka-piapa", "na-woela");
    expect(lesson?.lesson.currentRevisionId).toBeTruthy();
    expect((await listRevisions(db, lesson!.lesson.id)).length).toBe(1);
    expect((await search(db, "moolelo")).some((h) => h.href === "/c/moolelo-hawaii")).toBe(true);
  });
});

describe("structure", () => {
  it("lets editors add units and lessons with unique, non-reserved slugs", async () => {
    const { course, editor, member } = await setupCourse();
    const u1 = await createUnit(db, editor, course.id, { title: "Edit" });
    expect(u1.slug).toBe("edit-2");
    const u2 = await createUnit(db, editor, course.id, { title: "Intro" });
    const u3 = await createUnit(db, editor, course.id, { title: "Intro" });
    expect([u2.slug, u3.slug]).toEqual(["intro", "intro-2"]);
    expect(u3.position).toBe(3);
    const l = await createLesson(db, editor, u2.id, { title: "First Lesson", minutes: 15 });
    expect(l.slug).toBe("first-lesson");
    await expect(createUnit(db, member, course.id, { title: "Nope" })).rejects.toThrow(/permission/);
    await expect(createLesson(db, member, u2.id, { title: "Nope" })).rejects.toThrow(/permission/);
  });
});

describe("revision workflow", () => {
  it("requires contributor to propose and editor to approve", async () => {
    const { course, editor, contributor, member } = await setupCourse();
    const unit = await createUnit(db, editor, course.id, { title: "Unit" });
    const lesson = await createLesson(db, editor, unit.id, { title: "Lesson" });
    await expect(proposeRevision(db, member, lesson.id, { bodyMd: "x" })).rejects.toThrow(/permission/);
    const rev = await proposeRevision(db, contributor, lesson.id, { bodyMd: "New body", summary: "first draft" });
    expect(rev.status).toBe("proposed");
    expect((await listPendingRevisions(db, course.id)).length).toBe(1);
    await expect(reviewRevision(db, contributor, rev.id, "approve")).rejects.toThrow(/permission/);
    const res = await reviewRevision(db, editor, rev.id, "approve");
    expect(res.revision.status).toBe("approved");
    const [l] = await db.select().from(lessons).where(eq(lessons.id, lesson.id));
    expect(l.bodyMd).toBe("New body");
    expect(l.currentRevisionId).toBe(rev.id);
    await expect(reviewRevision(db, editor, rev.id, "approve")).rejects.toThrow(/already/);
  });

  it("rejects no-op proposals and keeps rejected text off the lesson", async () => {
    const { course, editor, contributor } = await setupCourse();
    const unit = await createUnit(db, editor, course.id, { title: "Unit" });
    const lesson = await createLesson(db, editor, unit.id, { title: "Lesson" });
    await expect(proposeRevision(db, contributor, lesson.id, { bodyMd: "" })).rejects.toThrow(/does not change/);
    const rev = await proposeRevision(db, contributor, lesson.id, { bodyMd: "spam" });
    await reviewRevision(db, editor, rev.id, "reject");
    const [l] = await db.select().from(lessons).where(eq(lessons.id, lesson.id));
    expect(l.bodyMd).toBe("");
  });

  it("stops editors approving their own edits but allows stewards", async () => {
    const { course, editor, steward } = await setupCourse();
    const unit = await createUnit(db, editor, course.id, { title: "Unit" });
    const lesson = await createLesson(db, editor, unit.id, { title: "Lesson" });
    const own = await proposeRevision(db, editor, lesson.id, { bodyMd: "mine" });
    await expect(reviewRevision(db, editor, own.id, "approve")).rejects.toThrow(/Another editor/);
    const stewardOwn = await proposeRevision(db, steward, lesson.id, { bodyMd: "steward text" });
    expect((await reviewRevision(db, steward, stewardOwn.id, "approve")).revision.status).toBe("approved");
  });

  it("lets stewards revert to an earlier approved revision", async () => {
    const { course, editor, contributor, steward } = await setupCourse();
    const unit = await createUnit(db, editor, course.id, { title: "Unit" });
    const lesson = await createLesson(db, editor, unit.id, { title: "Lesson" });
    const r1 = await proposeRevision(db, contributor, lesson.id, { bodyMd: "v1" });
    await reviewRevision(db, editor, r1.id, "approve");
    const r2 = await proposeRevision(db, contributor, lesson.id, { bodyMd: "v2 vandalism" });
    await reviewRevision(db, editor, r2.id, "approve");
    await expect(revertLesson(db, editor, lesson.id, r1.id)).rejects.toThrow(/permission/);
    await expect(revertLesson(db, steward, lesson.id, r2.id)).rejects.toThrow(/already current/);
    const { revision, reverted } = await revertLesson(db, steward, lesson.id, r1.id);
    expect(revision.revertOfId).toBe(r1.id);
    expect(reverted.map((r) => r.id)).toEqual([r2.id]);
    const [l] = await db.select().from(lessons).where(eq(lessons.id, lesson.id));
    expect(l.bodyMd).toBe("v1");
    expect((await listRevisions(db, lesson.id)).length).toBe(3);
  });

  it("opens a draft course once three units have content", async () => {
    const { course, editor, contributor } = await setupCourse();
    for (let i = 1; i <= 3; i++) {
      const unit = await createUnit(db, editor, course.id, { title: `Unit ${i}` });
      const lesson = await createLesson(db, editor, unit.id, { title: "Lesson" });
      const rev = await proposeRevision(db, contributor, lesson.id, { bodyMd: `content ${i}` });
      const res = await reviewRevision(db, editor, rev.id, "approve");
      expect(res.courseOpened).toBe(i === 3);
    }
    expect((await requireCourse(db, "test-course")).status).toBe("open");
    expect(await maybeOpenCourse(db, course.id)).toBe(false);
  });
});

describe("roles", () => {
  it("lets stewards assign and remove roles", async () => {
    const { course, steward, editor, member } = await setupCourse();
    await expect(assignCourseRole(db, editor, course.id, member.handle, "editor")).rejects.toThrow(/permission/);
    await assignCourseRole(db, steward, course.id, `@${member.handle}`, "editor");
    expect(await courseLevel(db, member, course.id)).toBe(LEVEL.editor);
    await assignCourseRole(db, steward, course.id, member.handle, "none");
    expect(await courseLevel(db, member, course.id)).toBe(LEVEL.member);
    await expect(assignCourseRole(db, steward, course.id, steward.handle, "none")).rejects.toThrow(/own role/);
    await expect(assignCourseRole(db, steward, course.id, "nobody-here", "editor")).rejects.toThrow(/No user/);
  });

  it("treats site moderators and admins as above every course role", async () => {
    const { course } = await setupCourse();
    const mod = await makeUser({ role: "moderator" });
    const admin = await makeUser({ role: "admin" });
    expect(await courseLevel(db, mod, course.id)).toBe(LEVEL.moderator);
    expect(await courseLevel(db, admin, course.id)).toBe(LEVEL.admin);
    expect(await courseLevel(db, null, course.id)).toBe(LEVEL.member);
  });

  it("grants Contributor automatically after 5 accepted answers", async () => {
    const { course, member } = await setupCourse();
    const asker = await makeUser();
    for (let i = 0; i < 5; i++) {
      const [t] = await db
        .insert(threads)
        .values({ courseId: course.id, authorId: asker.id, title: `Q${i}`, bodyMd: "?" })
        .returning();
      const [p] = await db.insert(posts).values({ threadId: t.id, authorId: member.id, bodyMd: "A" }).returning();
      if (i < 4) {
        await db.update(threads).set({ acceptedPostId: p.id }).where(eq(threads.id, t.id));
        expect(await courseLevel(db, member, course.id)).toBe(LEVEL.member);
      } else {
        await db.update(threads).set({ acceptedPostId: p.id }).where(eq(threads.id, t.id));
      }
    }
    expect(await courseLevel(db, member, course.id)).toBe(LEVEL.contributor);
    const rev = await db.select().from(revisions);
    expect(rev.length).toBe(0);
  });
});
