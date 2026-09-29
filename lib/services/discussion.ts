import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { badges, courses, lessons, posts, threads, units, users, votes } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { requireText } from "@/lib/text";
import { recordActivity } from "./engagement";
import { notify } from "./notifications";
import { LEVEL, courseLevel, maybeGrantContributor } from "./permissions";
import { RESOURCE_SCORE_FOR_POINTS, awardPoints, clawBack } from "./points";
import { enforceRateLimit } from "./rate-limit";
import type { AppUser } from "./users";

export type Scope = { courseId: string; unitId?: string | null; lessonId?: string | null };

/** Verifies that unit/lesson ids belong to the course and fills in the unit for a lesson. */
export async function resolveScope(db: Tx, scope: Scope): Promise<Required<Scope>> {
  const course = await db.query.courses.findFirst({ where: eq(courses.id, scope.courseId) });
  if (!course) throw new AppError("not_found", "Course not found");
  let unitId = scope.unitId ?? null;
  const lessonId = scope.lessonId ?? null;
  if (lessonId) {
    const [row] = await db
      .select({ unitId: units.id, courseId: units.courseId })
      .from(lessons)
      .innerJoin(units, eq(units.id, lessons.unitId))
      .where(eq(lessons.id, lessonId));
    if (!row || row.courseId !== course.id) throw new AppError("invalid", "Lesson is not in this course");
    unitId = row.unitId;
  } else if (unitId) {
    const u = await db.query.units.findFirst({ where: eq(units.id, unitId) });
    if (!u || u.courseId !== course.id) throw new AppError("invalid", "Unit is not in this course");
  }
  return { courseId: course.id, unitId, lessonId };
}

export async function createThread(db: Tx, user: AppUser, scope: Scope, input: { title: string; bodyMd: string }) {
  const s = await resolveScope(db, scope);
  const title = requireText(input.title, "Title", 5, 200);
  const bodyMd = requireText(input.bodyMd, "Question", 1, 20_000);
  await enforceRateLimit(db, user.id, "posts");
  const [t] = await db.insert(threads).values({ ...s, authorId: user.id, title, bodyMd }).returning();
  return t;
}

export async function createPost(db: Tx, user: AppUser, threadId: string, bodyMd: string) {
  const thread = await db.query.threads.findFirst({ where: eq(threads.id, threadId) });
  if (!thread) throw new AppError("not_found", "Thread not found");
  const body = requireText(bodyMd, "Answer", 1, 20_000);
  await enforceRateLimit(db, user.id, "posts");
  const [p] = await db.insert(posts).values({ threadId, authorId: user.id, bodyMd: body }).returning();
  if (thread.authorId !== user.id) {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, thread.courseId) });
    await notify(db, thread.authorId, "answer", `@${user.handle} answered “${thread.title}”`, `/c/${course?.slug}/q/${thread.id}`);
  }
  return p;
}

export type VoteTarget = "thread" | "post" | "resource";

async function targetInfo(db: Tx, type: VoteTarget, id: string) {
  const res =
    type === "thread"
      ? await db.execute<{ author: string | null }>(sql`SELECT author_id AS author FROM threads WHERE id = ${id}`)
      : type === "post"
        ? await db.execute<{ author: string | null }>(sql`SELECT author_id AS author FROM posts WHERE id = ${id}`)
        : await db.execute<{ author: string | null }>(sql`SELECT added_by_id AS author FROM resources WHERE id = ${id} AND approved`);
  if (!res.rows[0]) throw new AppError("not_found", "Nothing to vote on");
  return res.rows[0];
}

/** Sets the user's vote (+1, -1, or 0 to clear) and returns the target's new score. */
export async function vote(db: Tx, user: AppUser, type: VoteTarget, targetId: string, value: -1 | 0 | 1) {
  if (![-1, 0, 1].includes(value)) throw new AppError("invalid", "Vote must be +1, -1 or 0");
  const info = await targetInfo(db, type, targetId);
  if (info.author === user.id) throw new AppError("invalid", "You cannot vote on your own contribution");
  const existing = await db.query.votes.findFirst({
    where: and(eq(votes.userId, user.id), eq(votes.targetType, type), eq(votes.targetId, targetId)),
  });
  if (value === 0) {
    await db
      .delete(votes)
      .where(and(eq(votes.userId, user.id), eq(votes.targetType, type), eq(votes.targetId, targetId)));
  } else {
    if (!existing) await enforceRateLimit(db, user.id, "votes");
    await db
      .insert(votes)
      .values({ userId: user.id, targetType: type, targetId, value })
      .onConflictDoUpdate({ target: [votes.userId, votes.targetType, votes.targetId], set: { value } });
  }
  const table = type === "thread" ? "threads" : type === "post" ? "posts" : "resources";
  const res = await db.execute<{ score: number }>(sql`
    UPDATE ${sql.identifier(table)}
    SET score = COALESCE((SELECT sum(value) FROM votes WHERE target_type = ${type} AND target_id = ${targetId}), 0)
    WHERE id = ${targetId}
    RETURNING score`);
  const score = Number(res.rows[0]?.score ?? 0);
  if (type === "resource" && info.author && score >= RESOURCE_SCORE_FOR_POINTS) {
    await awardPoints(db, info.author, "approved_resource", "resource", targetId);
  }
  return score;
}

/** Marks (or clears, with postId null) the accepted answer. Allowed for the asker and Stewards. */
export async function acceptAnswer(db: Tx, user: AppUser, threadId: string, postId: string | null) {
  const thread = await db.query.threads.findFirst({ where: eq(threads.id, threadId) });
  if (!thread) throw new AppError("not_found", "Thread not found");
  const isAsker = thread.authorId === user.id;
  if (!isAsker && (await courseLevel(db, user, thread.courseId)) < LEVEL.steward) {
    throw new AppError("forbidden", "Only the asker or a Steward can accept an answer");
  }
  let post: typeof posts.$inferSelect | undefined;
  if (postId) {
    post = await db.query.posts.findFirst({ where: and(eq(posts.id, postId), eq(posts.threadId, threadId)) });
    if (!post) throw new AppError("invalid", "That answer is not in this thread");
  }
  const previous = thread.acceptedPostId;
  await db.update(threads).set({ acceptedPostId: postId }).where(eq(threads.id, threadId));
  if (previous && previous !== postId) {
    await clawBack(db, { type: "accepted_answer", sourceType: "post", sourceId: previous });
  }
  if (post && post.authorId !== thread.authorId && post.id !== previous) {
    await maybeGrantContributor(db, post.authorId, thread.courseId);
    await recordActivity(db, post.authorId);
    // No points when the accepter wrote the answer (self-accepted).
    if (post.authorId !== user.id) await awardPoints(db, post.authorId, "accepted_answer", "post", post.id);
    const course = await db.query.courses.findFirst({ where: eq(courses.id, thread.courseId) });
    await notify(db, post.authorId, "accepted", `Your answer to “${thread.title}” was accepted`, `/c/${course?.slug}/q/${thread.id}`);
  }
  return { thread, post: post ?? null, previousPostId: previous };
}

export async function listThreads(db: Tx, scope: Scope & { exact?: boolean }, limit = 20) {
  const conds = [eq(threads.courseId, scope.courseId)];
  if (scope.lessonId) conds.push(eq(threads.lessonId, scope.lessonId));
  else if (scope.unitId) conds.push(eq(threads.unitId, scope.unitId));
  else if (scope.exact) conds.push(isNull(threads.unitId), isNull(threads.lessonId));
  return db
    .select({
      id: threads.id,
      title: threads.title,
      score: threads.score,
      acceptedPostId: threads.acceptedPostId,
      createdAt: threads.createdAt,
      authorHandle: users.handle,
      answers: sql<number>`(SELECT count(*) FROM posts p WHERE p.thread_id = ${threads.id})::int`,
    })
    .from(threads)
    .innerJoin(users, eq(users.id, threads.authorId))
    .where(and(...conds))
    .orderBy(desc(threads.score), desc(threads.createdAt))
    .limit(limit);
}

/** Verified badges in the course's field (or for the course itself), keyed by user id. */
export async function fieldBadgesFor(db: Tx, courseId: string, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, string[]>();
  const course = await db.query.courses.findFirst({ where: eq(courses.id, courseId) });
  if (!course) return new Map<string, string[]>();
  const rows = await db
    .select({ userId: badges.userId, label: badges.label })
    .from(badges)
    .where(
      and(
        inArray(badges.userId, userIds),
        eq(badges.status, "verified"),
        eq(badges.display, true),
        inArray(badges.type, ["degree", "credential", "community", "contributor"]),
        sql`(${badges.fieldId} = ${course.fieldId} OR ${badges.courseId} = ${course.id})`,
      ),
    );
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.userId, [...(map.get(r.userId) ?? []), r.label]);
  return map;
}

export async function getThread(db: Tx, threadId: string, viewerId?: string) {
  const [row] = await db
    .select({ thread: threads, authorHandle: users.handle, authorName: users.name })
    .from(threads)
    .innerJoin(users, eq(users.id, threads.authorId))
    .where(eq(threads.id, threadId));
  if (!row) return null;
  const postRows = await db
    .select({ post: posts, authorHandle: users.handle, authorName: users.name })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.threadId, threadId))
    .orderBy(desc(posts.score), asc(posts.createdAt));
  const accepted = row.thread.acceptedPostId;
  postRows.sort((a, b) => Number(b.post.id === accepted) - Number(a.post.id === accepted));
  const badgeMap = await fieldBadgesFor(db, row.thread.courseId, [
    row.thread.authorId,
    ...postRows.map((p) => p.post.authorId),
  ]);
  const myVotes = viewerId
    ? await db
        .select({ targetId: votes.targetId, value: votes.value })
        .from(votes)
        .where(
          and(
            eq(votes.userId, viewerId),
            inArray(votes.targetId, [threadId, ...postRows.map((p) => p.post.id)]),
          ),
        )
    : [];
  return {
    ...row,
    posts: postRows,
    badges: badgeMap,
    myVotes: new Map(myVotes.map((v) => [v.targetId, v.value])),
  };
}
