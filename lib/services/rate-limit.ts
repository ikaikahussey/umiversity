import { sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { AppError } from "@/lib/errors";

/** Per-user daily limits (rolling 24 hours). */
export const DAILY_LIMITS = { requests: 10, posts: 30, votes: 100 } as const;
export type LimitKind = keyof typeof DAILY_LIMITS;

export async function countLastDay(db: Tx, userId: string, kind: LimitKind): Promise<number> {
  const since = sql`now() - interval '24 hours'`;
  const q =
    kind === "requests"
      ? sql`SELECT count(*) AS n FROM course_requests WHERE requester_id = ${userId} AND created_at > ${since}`
      : kind === "posts"
        ? sql`SELECT (SELECT count(*) FROM threads WHERE author_id = ${userId} AND created_at > ${since})
                   + (SELECT count(*) FROM posts WHERE author_id = ${userId} AND created_at > ${since}) AS n`
        : sql`SELECT (SELECT count(*) FROM votes WHERE user_id = ${userId} AND created_at > ${since})
                   + (SELECT count(*) FROM request_votes WHERE user_id = ${userId} AND created_at > ${since}) AS n`;
  const res = await db.execute<{ n: string }>(q);
  return Number(res.rows[0]?.n ?? 0);
}

export async function enforceRateLimit(db: Tx, userId: string, kind: LimitKind) {
  const used = await countLastDay(db, userId, kind);
  if (used >= DAILY_LIMITS[kind]) {
    throw new AppError("rate_limited", `Daily limit reached: ${DAILY_LIMITS[kind]} ${kind} per day`);
  }
}
