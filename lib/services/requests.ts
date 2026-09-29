import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { courseRequests, courseRoles, courses, fields, requestVotes, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { requireText } from "@/lib/text";
import { uniqueCourseSlug } from "./courses";
import { requireStaff } from "./permissions";
import { enforceRateLimit } from "./rate-limit";
import type { AppUser } from "./users";

/** Votes at which a request becomes a draft course. Configurable via REQUEST_PROMOTE_THRESHOLD. */
export function promoteThreshold(): number {
  const n = Number(process.env.REQUEST_PROMOTE_THRESHOLD);
  return Number.isInteger(n) && n > 0 ? n : 25;
}
/** How many voters besides the requester become founding editors. */
export const FOUNDING_VOTER_EDITORS = 4;
export const SIMILARITY_THRESHOLD = 0.3;

export type Similar = { kind: "request" | "course"; id: string; title: string; href: string; similarity: number };

/** Open requests and existing courses whose folded titles resemble `title` (pg_trgm). */
export async function findSimilar(db: Tx, title: string, excludeRequestId?: string): Promise<Similar[]> {
  const t = title.trim();
  if (t.length < 3) return [];
  const reqs = await db.execute<{ id: string; title: string; sim: number }>(sql`
    SELECT id, title, similarity(app_normalize(title), app_normalize(${t})) AS sim
    FROM course_requests
    WHERE status = 'open'
      AND similarity(app_normalize(title), app_normalize(${t})) > ${SIMILARITY_THRESHOLD}
      ${excludeRequestId ? sql`AND id <> ${excludeRequestId}` : sql``}
    ORDER BY sim DESC LIMIT 5`);
  const cs = await db.execute<{ id: string; title: string; slug: string; sim: number }>(sql`
    SELECT id, title, slug, similarity(app_normalize(title), app_normalize(${t})) AS sim
    FROM courses
    WHERE status <> 'archived' AND similarity(app_normalize(title), app_normalize(${t})) > ${SIMILARITY_THRESHOLD}
    ORDER BY sim DESC LIMIT 5`);
  return [
    ...cs.rows.map((r) => ({ kind: "course" as const, id: r.id, title: r.title, href: `/c/${r.slug}`, similarity: Number(r.sim) })),
    ...reqs.rows.map((r) => ({ kind: "request" as const, id: r.id, title: r.title, href: `/requests/${r.id}`, similarity: Number(r.sim) })),
  ].sort((a, b) => b.similarity - a.similarity);
}

export type SubmitInput = { title: string; description: string; fieldId: string; confirmNotDuplicate?: boolean };
export type SubmitResult =
  | { status: "duplicates"; matches: Similar[] }
  | { status: "created"; request: typeof courseRequests.$inferSelect };

export async function submitRequest(db: Tx, user: AppUser, input: SubmitInput): Promise<SubmitResult> {
  const title = requireText(input.title, "Title", 3, 120);
  const description = requireText(input.description, "Description", 20, 1200);
  const field = input.fieldId ? await db.query.fields.findFirst({ where: eq(fields.id, input.fieldId) }) : undefined;
  if (!field) throw new AppError("invalid", "Choose a field");
  await enforceRateLimit(db, user.id, "requests");
  if (!input.confirmNotDuplicate) {
    const matches = await findSimilar(db, title);
    if (matches.length > 0) return { status: "duplicates", matches };
  }
  const request = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(courseRequests)
      .values({ requesterId: user.id, title, description, fieldId: field.id, voteCount: 1 })
      .returning();
    await tx.insert(requestVotes).values({ requestId: r.id, userId: user.id });
    return r;
  });
  if (request.voteCount >= promoteThreshold()) await promoteRequest(db, request.id, null);
  const fresh = await db.query.courseRequests.findFirst({ where: eq(courseRequests.id, request.id) });
  return { status: "created", request: fresh ?? request };
}

async function recount(db: Tx, requestId: string): Promise<number> {
  const [row] = await db
    .update(courseRequests)
    .set({ voteCount: sql`(SELECT count(*) FROM request_votes WHERE request_id = ${requestId})::int` })
    .where(eq(courseRequests.id, requestId))
    .returning({ voteCount: courseRequests.voteCount });
  return row?.voteCount ?? 0;
}

export type VoteResult = { voteCount: number; voted: boolean; promotedCourseSlug: string | null };

/** Adds or removes the user's single vote on an open request; promotes at the threshold. */
export async function voteRequest(db: Tx, user: AppUser, requestId: string, on: boolean): Promise<VoteResult> {
  const req = await db.query.courseRequests.findFirst({ where: eq(courseRequests.id, requestId) });
  if (!req) throw new AppError("not_found", "Request not found");
  if (req.status !== "open") throw new AppError("conflict", "Voting is closed on this request");
  if (on) {
    await enforceRateLimit(db, user.id, "votes");
    await db.insert(requestVotes).values({ requestId, userId: user.id }).onConflictDoNothing();
  } else {
    if (req.requesterId === user.id) throw new AppError("invalid", "The requester's vote always counts");
    await db.delete(requestVotes).where(and(eq(requestVotes.requestId, requestId), eq(requestVotes.userId, user.id)));
  }
  const voteCount = await recount(db, requestId);
  let promotedCourseSlug: string | null = null;
  if (on && voteCount >= promoteThreshold()) {
    const course = await promoteRequest(db, requestId, null);
    promotedCourseSlug = course?.slug ?? null;
  }
  return { voteCount, voted: on, promotedCourseSlug };
}

/**
 * Turns an open request into a draft course. The requester and the earliest
 * voters become founding editors. `actor` null means automatic promotion.
 * Returns null if the request was no longer open (e.g. promoted concurrently).
 */
export async function promoteRequest(db: Tx, requestId: string, actor: AppUser | null) {
  if (actor) requireStaff(actor, "promote requests early");
  return db.transaction(async (tx) => {
    const locked = await tx.execute<{ id: string; status: string }>(
      sql`SELECT id, status FROM course_requests WHERE id = ${requestId} FOR UPDATE`,
    );
    if (!locked.rows[0]) throw new AppError("not_found", "Request not found");
    if (locked.rows[0].status !== "open") return null;
    const req = (await tx.query.courseRequests.findFirst({ where: eq(courseRequests.id, requestId) }))!;
    const slug = await uniqueCourseSlug(tx, req.title);
    const [course] = await tx
      .insert(courses)
      .values({
        fieldId: req.fieldId,
        title: req.title,
        slug,
        summary: req.description.slice(0, 300),
        overviewMd: req.description,
        keywords: req.title,
        status: "draft",
        requestId: req.id,
      })
      .returning();
    await tx
      .update(courseRequests)
      .set({ status: "promoted", courseId: course.id })
      .where(eq(courseRequests.id, req.id));
    const voters = await tx
      .select({ userId: requestVotes.userId })
      .from(requestVotes)
      .where(and(eq(requestVotes.requestId, req.id), sql`${requestVotes.userId} <> ${req.requesterId}`))
      .orderBy(asc(requestVotes.createdAt))
      .limit(FOUNDING_VOTER_EDITORS);
    const editorIds = [req.requesterId, ...voters.map((v) => v.userId)];
    await tx
      .insert(courseRoles)
      .values(editorIds.map((userId) => ({ courseId: course.id, userId, role: "editor" as const })))
      .onConflictDoNothing();
    return course;
  });
}

export async function mergeRequest(db: Tx, actor: AppUser, sourceId: string, targetId: string) {
  requireStaff(actor, "merge requests");
  if (sourceId === targetId) throw new AppError("invalid", "Cannot merge a request into itself");
  const [source, target] = await Promise.all([
    db.query.courseRequests.findFirst({ where: eq(courseRequests.id, sourceId) }),
    db.query.courseRequests.findFirst({ where: eq(courseRequests.id, targetId) }),
  ]);
  if (!source || !target) throw new AppError("not_found", "Request not found");
  if (source.status !== "open" || target.status !== "open") throw new AppError("conflict", "Both requests must be open");
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO request_votes (request_id, user_id, created_at)
      SELECT ${targetId}, user_id, created_at FROM request_votes WHERE request_id = ${sourceId}
      ON CONFLICT DO NOTHING`);
    await tx
      .update(courseRequests)
      .set({ status: "merged", mergedIntoId: targetId })
      .where(eq(courseRequests.id, sourceId));
    await recount(tx, targetId);
  });
  const count = (await db.query.courseRequests.findFirst({ where: eq(courseRequests.id, targetId) }))!.voteCount;
  if (count >= promoteThreshold()) await promoteRequest(db, targetId, null);
}

export async function rejectRequest(db: Tx, actor: AppUser, requestId: string) {
  requireStaff(actor, "reject requests");
  const [r] = await db
    .update(courseRequests)
    .set({ status: "rejected" })
    .where(and(eq(courseRequests.id, requestId), eq(courseRequests.status, "open")))
    .returning();
  if (!r) throw new AppError("conflict", "Only open requests can be rejected");
  return r;
}

export async function listRequests(db: Tx, sort: "top" | "new", limit = 50) {
  return db
    .select({
      id: courseRequests.id,
      title: courseRequests.title,
      description: courseRequests.description,
      voteCount: courseRequests.voteCount,
      createdAt: courseRequests.createdAt,
      fieldName: fields.name,
      requesterHandle: users.handle,
    })
    .from(courseRequests)
    .innerJoin(fields, eq(fields.id, courseRequests.fieldId))
    .innerJoin(users, eq(users.id, courseRequests.requesterId))
    .where(eq(courseRequests.status, "open"))
    .orderBy(
      ...(sort === "top"
        ? [desc(courseRequests.voteCount), desc(courseRequests.createdAt)]
        : [desc(courseRequests.createdAt)]),
    )
    .limit(limit);
}

export async function getRequestDetail(db: Tx, requestId: string, viewerId?: string) {
  const rows = await db
    .select({ request: courseRequests, fieldName: fields.name, requesterHandle: users.handle })
    .from(courseRequests)
    .innerJoin(fields, eq(fields.id, courseRequests.fieldId))
    .innerJoin(users, eq(users.id, courseRequests.requesterId))
    .where(eq(courseRequests.id, requestId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const voted = viewerId
    ? Boolean(
        await db.query.requestVotes.findFirst({
          where: and(eq(requestVotes.requestId, requestId), eq(requestVotes.userId, viewerId)),
        }),
      )
    : false;
  const similar = row.request.status === "open" ? await findSimilar(db, row.request.title, requestId) : [];
  const mergedFrom = await db
    .select({ id: courseRequests.id, title: courseRequests.title })
    .from(courseRequests)
    .where(eq(courseRequests.mergedIntoId, requestId));
  const mergedInto = row.request.mergedIntoId
    ? await db.query.courseRequests.findFirst({ where: eq(courseRequests.id, row.request.mergedIntoId) })
    : null;
  const course = row.request.courseId
    ? await db.query.courses.findFirst({ where: eq(courses.id, row.request.courseId) })
    : null;
  return { ...row, voted, similar, mergedFrom, mergedInto, course };
}
