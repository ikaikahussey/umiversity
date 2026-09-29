import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { badges, courseRoles, courses, lessons, posts, resources, threads, units, votes } from "@/db/schema";
import {
  acceptAnswer,
  createPost,
  createThread,
  getThread,
  listThreads,
  vote,
} from "@/lib/services/discussion";
import { courseLevel, LEVEL } from "@/lib/services/permissions";
import { DAILY_LIMITS } from "@/lib/services/rate-limit";
import {
  addResource,
  inferType,
  listPendingResources,
  listResources,
  normalizeUrl,
  reviewResource,
} from "@/lib/services/resources";
import { suggestYouTubeResources, type FetchLike } from "@/lib/services/youtube";
import { makeField, makeUser, resetDb, testDb as db } from "../helpers/db";

beforeEach(resetDb);

async function setup() {
  const { field } = await makeField("Hawaiian Language");
  const [course] = await db.insert(courses).values({ fieldId: field.id, title: "Course", slug: "course", keywords: "olelo hawaii" }).returning();
  const [unit] = await db.insert(units).values({ courseId: course.id, position: 1, slug: "u1", title: "U1" }).returning();
  const [lesson] = await db.insert(lessons).values({ unitId: unit.id, position: 1, slug: "l1", title: "L1" }).returning();
  const [otherCourse] = await db.insert(courses).values({ fieldId: field.id, title: "Other", slug: "other" }).returning();
  const asker = await makeUser();
  const answerer = await makeUser();
  const voter = await makeUser();
  const steward = await makeUser();
  const editor = await makeUser();
  await db.insert(courseRoles).values([
    { courseId: course.id, userId: steward.id, role: "steward" },
    { courseId: course.id, userId: editor.id, role: "editor" },
  ]);
  return { field, course, unit, lesson, otherCourse, asker, answerer, voter, steward, editor };
}

describe("threads and posts", () => {
  it("creates threads scoped to course, unit or lesson", async () => {
    const s = await setup();
    const t = await createThread(db, s.asker, { courseId: s.course.id, lessonId: s.lesson.id }, { title: "How is w pronounced?", bodyMd: "?" });
    expect(t.unitId).toBe(s.unit.id);
    await createThread(db, s.asker, { courseId: s.course.id }, { title: "General question here", bodyMd: "?" });
    expect((await listThreads(db, { courseId: s.course.id })).length).toBe(2);
    expect((await listThreads(db, { courseId: s.course.id, lessonId: s.lesson.id })).length).toBe(1);
    expect((await listThreads(db, { courseId: s.course.id, exact: true })).length).toBe(1);
    await expect(
      createThread(db, s.asker, { courseId: s.otherCourse.id, lessonId: s.lesson.id }, { title: "Mismatched scope", bodyMd: "?" }),
    ).rejects.toThrow(/not in this course/);
    await expect(createThread(db, s.asker, { courseId: s.course.id }, { title: "Hi", bodyMd: "?" })).rejects.toThrow(/Title/);
  });

  it("enforces 30 posts per day across threads and replies", async () => {
    const s = await setup();
    const t = await createThread(db, s.asker, { courseId: s.course.id }, { title: "Rate limit thread", bodyMd: "?" });
    for (let i = 0; i < DAILY_LIMITS.posts - 1; i++) await createPost(db, s.asker, t.id, `reply ${i}`);
    await expect(createPost(db, s.asker, t.id, "one too many")).rejects.toThrow(/Daily limit/);
  });
});

describe("votes", () => {
  it("scores threads and posts, one vote per user, no self-votes", async () => {
    const s = await setup();
    const t = await createThread(db, s.asker, { courseId: s.course.id }, { title: "Scored thread", bodyMd: "?" });
    const p = await createPost(db, s.answerer, t.id, "answer");
    expect(await vote(db, s.voter, "thread", t.id, 1)).toBe(1);
    expect(await vote(db, s.voter, "thread", t.id, 1)).toBe(1);
    expect(await vote(db, s.answerer, "thread", t.id, -1)).toBe(0);
    expect(await vote(db, s.voter, "thread", t.id, 0)).toBe(-1);
    expect(await vote(db, s.voter, "post", p.id, 1)).toBe(1);
    await expect(vote(db, s.answerer, "post", p.id, 1)).rejects.toThrow(/own/);
    await expect(vote(db, s.voter, "post", "00000000-0000-0000-0000-000000000000", 1)).rejects.toThrow(/Nothing/);
    const [row] = await db.select().from(posts).where(eq(posts.id, p.id));
    expect(row.score).toBe(1);
  });

  it("enforces 100 votes per day", async () => {
    const s = await setup();
    const t = await createThread(db, s.asker, { courseId: s.course.id }, { title: "Vote limit thread", bodyMd: "?" });
    const rows = Array.from({ length: DAILY_LIMITS.votes }, () => ({
      userId: s.voter.id,
      targetType: "post" as const,
      targetId: crypto.randomUUID(),
      value: 1,
    }));
    await db.insert(votes).values(rows);
    await expect(vote(db, s.voter, "thread", t.id, 1)).rejects.toThrow(/Daily limit/);
  });
});

describe("accepted answers", () => {
  it("lets the asker or a steward accept, and sorts the accepted answer first", async () => {
    const s = await setup();
    const t = await createThread(db, s.asker, { courseId: s.course.id }, { title: "Which answer wins?", bodyMd: "?" });
    const a1 = await createPost(db, s.answerer, t.id, "first");
    const a2 = await createPost(db, s.voter, t.id, "second");
    await vote(db, s.steward, "post", a1.id, 1);
    await expect(acceptAnswer(db, s.voter, t.id, a2.id)).rejects.toThrow(/asker or a Steward/);
    await expect(acceptAnswer(db, s.editor, t.id, a2.id)).rejects.toThrow(/asker or a Steward/);
    await acceptAnswer(db, s.asker, t.id, a2.id);
    let view = await getThread(db, t.id, s.steward.id);
    expect(view?.posts.map((p) => p.post.id)).toEqual([a2.id, a1.id]);
    expect(view?.myVotes.get(a1.id)).toBe(1);
    const res = await acceptAnswer(db, s.steward, t.id, a1.id);
    expect(res.previousPostId).toBe(a2.id);
    view = await getThread(db, t.id);
    expect(view?.thread.acceptedPostId).toBe(a1.id);
    const other = await createThread(db, s.asker, { courseId: s.course.id }, { title: "Another question", bodyMd: "?" });
    await expect(acceptAnswer(db, s.asker, other.id, a1.id)).rejects.toThrow(/not in this thread/);
    await acceptAnswer(db, s.asker, t.id, null);
    const [row] = await db.select().from(threads).where(eq(threads.id, t.id));
    expect(row.acceptedPostId).toBeNull();
  });

  it("persists Contributor after the fifth accepted answer", async () => {
    const s = await setup();
    for (let i = 0; i < 5; i++) {
      const t = await createThread(db, s.asker, { courseId: s.course.id }, { title: `Question number ${i}`, bodyMd: "?" });
      const p = await createPost(db, s.answerer, t.id, "answer");
      await acceptAnswer(db, s.asker, t.id, p.id);
    }
    const role = await db.query.courseRoles.findFirst({ where: eq(courseRoles.userId, s.answerer.id) });
    expect(role?.role).toBe("contributor");
    expect(await courseLevel(db, s.answerer, s.course.id)).toBe(LEVEL.contributor);
  });

  it("shows field badges beside names", async () => {
    const s = await setup();
    await db.insert(badges).values({
      userId: s.answerer.id,
      type: "degree",
      fieldId: s.field.id,
      label: "MA, Hawaiian Language",
      status: "verified",
    });
    await db.insert(badges).values({ userId: s.answerer.id, type: "degree", fieldId: s.field.id, label: "Pending", status: "pending" });
    const t = await createThread(db, s.asker, { courseId: s.course.id }, { title: "Badge display test", bodyMd: "?" });
    await createPost(db, s.answerer, t.id, "answer");
    const view = await getThread(db, t.id);
    expect(view?.badges.get(s.answerer.id)).toEqual(["MA, Hawaiian Language"]);
    expect(view?.badges.get(s.asker.id)).toBeUndefined();
  });
});

describe("resources", () => {
  it("normalizes URLs and infers types", () => {
    expect(normalizeUrl("https://example.org/a#frag")).toBe("https://example.org/a");
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow(/web links|https/);
    expect(() => normalizeUrl("not a url")).toThrow(/https/);
    expect(inferType("https://www.youtube.com/watch?v=abc")).toBe("video");
    expect(inferType("https://www.coursera.org/learn/x")).toBe("course");
    expect(inferType("https://archive.org/details/x")).toBe("archive");
    expect(inferType("https://example.org")).toBe("other");
  });

  it("holds members' links for editor approval and publishes contributors' links", async () => {
    const s = await setup();
    const pending = await addResource(db, s.voter, {
      courseId: s.course.id,
      lessonId: s.lesson.id,
      url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      title: "Pronunciation video",
      level: "beginner",
    });
    expect(pending.approved).toBe(false);
    expect(pending.type).toBe("video");
    expect(await listResources(db, { courseId: s.course.id, lessonId: s.lesson.id })).toEqual([]);
    await expect(
      addResource(db, s.asker, { courseId: s.course.id, url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", title: "Dup" }),
    ).rejects.toThrow(/already listed/);
    await expect(vote(db, s.asker, "resource", pending.id, 1)).rejects.toThrow(/Nothing/);
    await expect(reviewResource(db, s.voter, pending.id, "approve")).rejects.toThrow(/permission/);
    await reviewResource(db, s.editor, pending.id, "approve");
    const listed = await listResources(db, { courseId: s.course.id, lessonId: s.lesson.id }, s.asker.id);
    expect(listed.map((r) => r.resource.title)).toEqual(["Pronunciation video"]);
    expect(await vote(db, s.asker, "resource", pending.id, 1)).toBe(1);
    const direct = await addResource(db, s.editor, {
      courseId: s.course.id,
      url: "https://ulukau.org/",
      title: "Ulukau library",
      type: "archive",
      level: "advanced",
    });
    expect(direct.approved).toBe(true);
    const spam = await addResource(db, s.voter, { courseId: s.course.id, url: "https://spam.example/", title: "Spam link" });
    await reviewResource(db, s.editor, spam.id, "reject");
    expect(await db.select().from(resources).where(eq(resources.id, spam.id))).toEqual([]);
  });
});

describe("YouTube suggestion job", () => {
  it("stores new videos as hidden suggestions and skips duplicates", async () => {
    const s = await setup();
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { id: { videoId: "abcdefghijk" }, snippet: { title: "Learn &#39;Olelo" } },
            { id: { videoId: "bad" }, snippet: { title: "Invalid id" } },
            { id: {}, snippet: { title: "No id" } },
          ],
        }),
      };
    };
    const first = await suggestYouTubeResources(db, { apiKey: "k", fetchImpl });
    expect(first).toEqual({ courses: 2, added: 2, errors: [] });
    expect(calls[0]).toContain("q=olelo+hawaii");
    expect(calls[0]).toContain("safeSearch=strict");
    const second = await suggestYouTubeResources(db, { apiKey: "k", fetchImpl });
    expect(second.added).toBe(0);
    const pending = await listPendingResources(db, s.course.id);
    expect(pending[0].resource).toMatchObject({ source: "youtube_job", approved: false, title: "Learn 'Olelo" });
    expect(await listResources(db, { courseId: s.course.id })).toEqual([]);
  });

  it("records API errors without failing the whole run", async () => {
    await setup();
    const res = await suggestYouTubeResources(db, {
      apiKey: "k",
      fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }),
    });
    expect(res.added).toBe(0);
    expect(res.errors.length).toBe(2);
  });
});
