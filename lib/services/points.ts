import { and, desc, eq, lte, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { pointEvents, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { requireStaff } from "./permissions";
import type { AppUser } from "./users";

/** Achievement points; contribution is weighted above consumption. */
export const POINTS = {
  accepted_answer: 10,
  approved_edit: 15,
  approved_resource: 5,
  unit_completed: 3,
  new_field: 20,
  polymath_level: 50,
  course_promoted: 25,
} as const;
export type PointType = keyof typeof POINTS;

export const HOLD_DAYS = 30;
/** A resource earns points for its adder once its score reaches this. */
export const RESOURCE_SCORE_FOR_POINTS = 5;

export function monthOf(at: Date): string {
  return at.toISOString().slice(0, 7);
}

/** Records points as held for 30 days. Re-earning a clawed-back award re-opens it. */
export async function awardPoints(
  db: Tx,
  userId: string,
  type: PointType,
  sourceType: string,
  sourceId: string,
  at = new Date(),
) {
  const clearsAt = new Date(at.getTime() + HOLD_DAYS * 86_400_000);
  await db
    .insert(pointEvents)
    .values({ userId, type, points: POINTS[type], sourceType, sourceId, status: "held", clearsAt, createdAt: at })
    .onConflictDoUpdate({
      target: [pointEvents.userId, pointEvents.type, pointEvents.sourceType, pointEvents.sourceId],
      set: { status: "held", clearsAt, createdAt: at },
      setWhere: sql`${pointEvents.status} = 'clawed_back'`,
    });
}

/**
 * Claws back points for a reversed action (reverted edit, reversed acceptance)
 * unless the month they were earned in has already been paid out.
 */
export async function clawBack(db: Tx, match: { type: PointType; sourceType: string; sourceId: string; userId?: string }) {
  const res = await db.execute<{ id: string }>(sql`
    UPDATE point_events pe SET status = 'clawed_back'
    WHERE pe.type = ${match.type} AND pe.source_type = ${match.sourceType} AND pe.source_id = ${match.sourceId}
      ${match.userId ? sql`AND pe.user_id = ${match.userId}` : sql``}
      AND pe.status IN ('held', 'cleared')
      AND NOT EXISTS (SELECT 1 FROM payout_periods pp WHERE pp.month = to_char(pe.created_at AT TIME ZONE 'UTC', 'YYYY-MM'))
    RETURNING pe.id`);
  return res.rows.length;
}

/** Moves held points past their 30-day hold to cleared, except for frozen users. */
export async function clearMaturedPoints(db: Tx, now = new Date()) {
  const res = await db
    .update(pointEvents)
    .set({ status: "cleared" })
    .where(
      and(
        eq(pointEvents.status, "held"),
        lte(pointEvents.clearsAt, now),
        sql`${pointEvents.userId} NOT IN (SELECT id FROM users WHERE points_frozen)`,
      ),
    )
    .returning({ id: pointEvents.id });
  return res.length;
}

export async function setPointsFrozen(db: Tx, actor: AppUser, handle: string, frozen: boolean) {
  requireStaff(actor, "freeze points");
  const [u] = await db
    .update(users)
    .set({ pointsFrozen: frozen })
    .where(sql`lower(${users.handle}) = ${handle.trim().replace(/^@/, "").toLowerCase()}`)
    .returning();
  if (!u) throw new AppError("not_found", "No user with that handle");
  return u;
}

export async function pointsSummary(db: Tx, userId: string) {
  const rows = await db
    .select({ status: pointEvents.status, total: sql<number>`coalesce(sum(${pointEvents.points}), 0)::int` })
    .from(pointEvents)
    .where(eq(pointEvents.userId, userId))
    .groupBy(pointEvents.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.total])) as Record<string, number>;
  return { held: by.held ?? 0, cleared: by.cleared ?? 0, clawedBack: by.clawed_back ?? 0 };
}

export async function recentPointEvents(db: Tx, userId: string, limit = 30) {
  return db
    .select()
    .from(pointEvents)
    .where(eq(pointEvents.userId, userId))
    .orderBy(desc(pointEvents.createdAt))
    .limit(limit);
}

/**
 * Integrity check: pairs of accounts that mostly vote for each other.
 * Flags pairs with at least `minEach` upvotes in each direction in the window.
 */
export async function collusionFlags(db: Tx, days = 30, minEach = 5) {
  const res = await db.execute<{ a: string; b: string; a_to_b: number; b_to_a: number }>(sql`
    WITH authored AS (
      SELECT 'thread'::vote_target AS t, id, author_id FROM threads
      UNION ALL SELECT 'post'::vote_target, id, author_id FROM posts
      UNION ALL SELECT 'resource'::vote_target, id, added_by_id FROM resources WHERE added_by_id IS NOT NULL
    ),
    edges AS (
      SELECT v.user_id AS voter, a.author_id AS author, count(*)::int AS n
      FROM votes v JOIN authored a ON a.t = v.target_type AND a.id = v.target_id
      WHERE v.value > 0 AND v.created_at > now() - make_interval(days => ${days})
      GROUP BY 1, 2
    )
    SELECT ua.handle AS a, ub.handle AS b, e1.n AS a_to_b, e2.n AS b_to_a
    FROM edges e1 JOIN edges e2 ON e2.voter = e1.author AND e2.author = e1.voter
    JOIN users ua ON ua.id = e1.voter JOIN users ub ON ub.id = e1.author
    WHERE e1.voter < e1.author AND e1.n >= ${minEach} AND e2.n >= ${minEach}
    ORDER BY e1.n + e2.n DESC`);
  return res.rows;
}

