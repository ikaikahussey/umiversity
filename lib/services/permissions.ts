import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { courseRoles } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { AppUser } from "./users";

/** Ordered permission levels; the higher of site role and course role applies. */
export const LEVEL = { member: 0, contributor: 1, editor: 2, steward: 3, moderator: 4, admin: 5 } as const;
export type Level = (typeof LEVEL)[keyof typeof LEVEL];
export type CourseRole = "steward" | "editor" | "contributor";

/** Accepted edits plus accepted answers needed for automatic Contributor status. */
export const AUTO_CONTRIBUTOR_THRESHOLD = 5;

export function isSiteStaff(user: Pick<AppUser, "role"> | null | undefined): boolean {
  return user?.role === "moderator" || user?.role === "admin";
}

export async function getCourseRole(db: Tx, userId: string, courseId: string): Promise<CourseRole | null> {
  const row = await db.query.courseRoles.findFirst({
    where: and(eq(courseRoles.courseId, courseId), eq(courseRoles.userId, userId)),
  });
  return row?.role ?? null;
}

/** Approved lesson edits plus accepted answers a user has in one course. */
export async function acceptedContributionCount(db: Tx, userId: string, courseId: string): Promise<number> {
  const res = await db.execute<{ n: string }>(sql`
    SELECT (
      (SELECT count(*) FROM revisions r
         JOIN lessons l ON l.id = r.lesson_id
         JOIN units u ON u.id = l.unit_id
       WHERE u.course_id = ${courseId} AND r.author_id = ${userId}
         AND r.status = 'approved' AND r.revert_of_id IS NULL
         AND (r.reviewer_id IS NULL OR r.reviewer_id <> r.author_id))
      +
      (SELECT count(*) FROM threads t
         JOIN posts p ON p.id = t.accepted_post_id
       WHERE t.course_id = ${courseId} AND p.author_id = ${userId} AND t.author_id <> ${userId})
    ) AS n`);
  return Number(res.rows[0]?.n ?? 0);
}

export async function courseLevel(db: Tx, user: AppUser | null, courseId: string): Promise<Level> {
  if (!user) return LEVEL.member;
  if (user.role === "admin") return LEVEL.admin;
  if (user.role === "moderator") return LEVEL.moderator;
  const role = await getCourseRole(db, user.id, courseId);
  if (role) return LEVEL[role];
  if ((await acceptedContributionCount(db, user.id, courseId)) >= AUTO_CONTRIBUTOR_THRESHOLD) {
    return LEVEL.contributor;
  }
  return LEVEL.member;
}

export async function requireCourseLevel(
  db: Tx,
  user: AppUser,
  courseId: string,
  min: Level,
  what: string,
): Promise<Level> {
  const level = await courseLevel(db, user, courseId);
  if (level < min) throw new AppError("forbidden", `You do not have permission to ${what}`);
  return level;
}

export function requireStaff(user: AppUser, what: string) {
  if (!isSiteStaff(user)) throw new AppError("forbidden", `Only moderators can ${what}`);
}

/** Persists Contributor status once the automatic threshold is reached. */
export async function maybeGrantContributor(db: Tx, userId: string, courseId: string): Promise<boolean> {
  if (await getCourseRole(db, userId, courseId)) return false;
  if ((await acceptedContributionCount(db, userId, courseId)) < AUTO_CONTRIBUTOR_THRESHOLD) return false;
  await db.insert(courseRoles).values({ courseId, userId, role: "contributor" }).onConflictDoNothing();
  return true;
}

export type Capabilities = {
  level: Level;
  canProposeEdits: boolean;
  canApprove: boolean;
  canSteward: boolean;
  isStaff: boolean;
};

export function capabilitiesFor(level: Level): Capabilities {
  return {
    level,
    canProposeEdits: level >= LEVEL.contributor,
    canApprove: level >= LEVEL.editor,
    canSteward: level >= LEVEL.steward,
    isStaff: level >= LEVEL.moderator,
  };
}
