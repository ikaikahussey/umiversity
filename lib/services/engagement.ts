import { and, asc, eq, gte, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import {
  badges,
  cardReviews,
  courses,
  dailyCards,
  domains,
  fields,
  follows,
  lessons,
  progress,
  streaks,
  units,
  users,
} from "@/db/schema";
import { localDate, weekStart } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { applyActivity, emptyStreak, nightlyCheck, type StreakState } from "@/lib/streaks";
import { requireText } from "@/lib/text";
import { notify } from "./notifications";
import { LEVEL, requireCourseLevel } from "./permissions";
import { awardPoints } from "./points";
import type { AppUser } from "./users";

/* ---------- streaks ---------- */

function toState(row: typeof streaks.$inferSelect | undefined): StreakState {
  if (!row) return emptyStreak();
  return {
    current: row.current,
    longest: row.longest,
    lastActiveDate: row.lastActiveDate,
    freezesLeft: row.freezesLeft,
    freezeWeek: row.freezeWeek,
  };
}

async function saveStreak(db: Tx, userId: string, s: StreakState) {
  await db
    .insert(streaks)
    .values({ userId, ...s })
    .onConflictDoUpdate({ target: streaks.userId, set: { ...s } });
}

async function userTimezone(db: Tx, userId: string): Promise<string> {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { timezone: true } });
  return u?.timezone ?? "UTC";
}

export async function getStreak(db: Tx, userId: string): Promise<StreakState> {
  return toState(await db.query.streaks.findFirst({ where: eq(streaks.userId, userId) }));
}

/** Records a streak day (lesson completed, card reviewed, or answer accepted). */
export async function recordActivity(db: Tx, userId: string, at = new Date()): Promise<StreakState> {
  const today = localDate(at, await userTimezone(db, userId));
  const next = applyActivity(await getStreak(db, userId), today);
  await saveStreak(db, userId, next);
  return next;
}

/** Nightly job: bridges single missed days with freezes and resets broken streaks. */
export async function runNightlyStreaks(db: Tx, at = new Date()) {
  const rows = await db
    .select({ streak: streaks, timezone: users.timezone })
    .from(streaks)
    .innerJoin(users, eq(users.id, streaks.userId))
    .where(sql`${streaks.current} > 0`);
  let reset = 0;
  let frozen = 0;
  for (const { streak, timezone } of rows) {
    const before = toState(streak);
    const after = nightlyCheck(before, localDate(at, timezone));
    if (after.current === 0 && before.current > 0) reset++;
    else if (after.freezesLeft < before.freezesLeft) frozen++;
    if (JSON.stringify(after) !== JSON.stringify(before)) await saveStreak(db, streak.userId, after);
  }
  return { checked: rows.length, reset, frozen };
}

/* ---------- progress, units, polymath ---------- */

export type PolymathLevel = 0 | 1 | 2 | 3;

/** I: 2 active fields; II: 3; III: 5 fields across at least 3 domains. */
export function polymathLevel(activeFields: number, activeDomains: number): PolymathLevel {
  if (activeFields >= 5 && activeDomains >= 3) return 3;
  if (activeFields >= 3) return 2;
  if (activeFields >= 2) return 1;
  return 0;
}

export const POLYMATH_LABELS: Record<Exclude<PolymathLevel, 0>, string> = {
  1: "Polymath I",
  2: "Polymath II",
  3: "Polymath III",
};

/** Units the user has fully completed (every lesson in the unit, unit has ≥1 lesson). */
export async function completedUnits(db: Tx, userId: string) {
  const res = await db.execute<{
    unit_id: string;
    unit_title: string;
    unit_position: number;
    course_id: string;
    course_title: string;
    field_id: string;
    domain_id: string;
  }>(sql`
    SELECT u.id AS unit_id, u.title AS unit_title, u.position AS unit_position,
           c.id AS course_id, c.title AS course_title, c.field_id, f.domain_id
    FROM units u
    JOIN courses c ON c.id = u.course_id
    JOIN fields f ON f.id = c.field_id
    JOIN lessons l ON l.unit_id = u.id
    LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ${userId}
    GROUP BY u.id, c.id, f.domain_id
    HAVING count(l.id) > 0 AND count(l.id) = count(p.lesson_id)`);
  return res.rows;
}

export async function activeBreadth(db: Tx, userId: string) {
  const done = await completedUnits(db, userId);
  const fieldIds = new Set(done.map((d) => d.field_id));
  const domainIds = new Set(done.map((d) => d.domain_id));
  return { units: done, fieldIds, domainIds, level: polymathLevel(fieldIds.size, domainIds.size) };
}

export type CompletionResult = {
  alreadyCompleted: boolean;
  unitCompleted: { unitId: string; courseId: string } | null;
  newFieldId: string | null;
  polymathLevelsReached: PolymathLevel[];
  streak: StreakState;
};

async function awardBadge(
  db: Tx,
  userId: string,
  b: { type: "learner" | "polymath" | "contributor"; label: string; awardKey: string; fieldId?: string | null; courseId?: string | null },
) {
  const inserted = await db
    .insert(badges)
    .values({ userId, status: "verified", decidedAt: new Date(), ...b })
    .onConflictDoNothing()
    .returning({ id: badges.id });
  return inserted.length > 0;
}

/** Marks a lesson complete, updates the streak, and awards unit and polymath badges. */
export async function completeLesson(db: Tx, user: AppUser, lessonId: string, at = new Date()): Promise<CompletionResult> {
  const [row] = await db
    .select({ lesson: lessons, unit: units, course: courses })
    .from(lessons)
    .innerJoin(units, eq(units.id, lessons.unitId))
    .innerJoin(courses, eq(courses.id, units.courseId))
    .where(eq(lessons.id, lessonId));
  if (!row) throw new AppError("not_found", "Lesson not found");
  const before = await activeBreadth(db, user.id);
  const inserted = await db
    .insert(progress)
    .values({ userId: user.id, lessonId, completedAt: at })
    .onConflictDoNothing()
    .returning({ lessonId: progress.lessonId });
  const streak = await recordActivity(db, user.id, at);
  const result: CompletionResult = {
    alreadyCompleted: inserted.length === 0,
    unitCompleted: null,
    newFieldId: null,
    polymathLevelsReached: [],
    streak,
  };
  if (result.alreadyCompleted) return result;

  const after = await activeBreadth(db, user.id);
  const unitDone = after.units.find((u) => u.unit_id === row.unit.id);
  if (unitDone && !before.units.some((u) => u.unit_id === row.unit.id)) {
    result.unitCompleted = { unitId: row.unit.id, courseId: row.course.id };
    await awardBadge(db, user.id, {
      type: "learner",
      label: `Completed: ${row.course.title} Unit ${row.unit.position}`,
      awardKey: `unit:${row.unit.id}`,
      fieldId: row.course.fieldId,
      courseId: row.course.id,
    });
    await awardPoints(db, user.id, "unit_completed", "unit", row.unit.id, at);
    if (!before.fieldIds.has(row.course.fieldId)) {
      result.newFieldId = row.course.fieldId;
      await awardPoints(db, user.id, "new_field", "field", row.course.fieldId, at);
    }
    for (let lvl = (before.level + 1) as PolymathLevel; lvl <= after.level; lvl = (lvl + 1) as PolymathLevel) {
      const label = POLYMATH_LABELS[lvl as 1 | 2 | 3];
      if (await awardBadge(db, user.id, { type: "polymath", label, awardKey: `polymath:${lvl}` })) {
        result.polymathLevelsReached.push(lvl);
        await awardPoints(db, user.id, "polymath_level", "polymath", String(lvl), at);
        await notify(db, user.id, "badge", `You reached ${label}.`, `/u/${user.handle}`);
      }
    }
  }
  return result;
}

export async function lessonCompleted(db: Tx, userId: string, lessonId: string) {
  return Boolean(
    await db.query.progress.findFirst({ where: and(eq(progress.userId, userId), eq(progress.lessonId, lessonId)) }),
  );
}

export async function courseProgress(db: Tx, userId: string, courseId: string) {
  const res = await db.execute<{ total: string; done: string }>(sql`
    SELECT count(l.id) AS total, count(p.lesson_id) AS done
    FROM lessons l JOIN units u ON u.id = l.unit_id
    LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ${userId}
    WHERE u.course_id = ${courseId}`);
  return { total: Number(res.rows[0]?.total ?? 0), done: Number(res.rows[0]?.done ?? 0) };
}

export async function completedLessonIds(db: Tx, userId: string, courseId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: progress.lessonId })
    .from(progress)
    .innerJoin(lessons, eq(lessons.id, progress.lessonId))
    .innerJoin(units, eq(units.id, lessons.unitId))
    .where(and(eq(progress.userId, userId), eq(units.courseId, courseId)));
  return new Set(rows.map((r) => r.id));
}

/* ---------- weekly goal ---------- */

export async function weeklyProgress(db: Tx, user: AppUser, at = new Date()) {
  const monday = weekStart(localDate(at, user.timezone));
  const res = await db.execute<{ lessons: string; minutes: string }>(sql`
    SELECT count(*) AS lessons, coalesce(sum(l.minutes), 0) AS minutes
    FROM progress p JOIN lessons l ON l.id = p.lesson_id
    WHERE p.user_id = ${user.id}
      AND (p.completed_at AT TIME ZONE ${user.timezone})::date >= ${monday}::date`);
  const lessonsDone = Number(res.rows[0]?.lessons ?? 0);
  const minutes = Number(res.rows[0]?.minutes ?? 0);
  const value = user.weeklyGoalType === "minutes" ? minutes : lessonsDone;
  return {
    type: user.weeklyGoalType,
    target: user.weeklyGoalTarget,
    value,
    lessons: lessonsDone,
    minutes,
    percent: Math.min(100, Math.round((value / Math.max(1, user.weeklyGoalTarget)) * 100)),
  };
}

/* ---------- breadth map ---------- */

export async function breadthMap(db: Tx, userId: string) {
  const all = await db
    .select({ domainId: domains.id, domain: domains.name, fieldId: fields.id, field: fields.name })
    .from(fields)
    .innerJoin(domains, eq(domains.id, fields.domainId))
    .orderBy(asc(domains.name), asc(fields.name));
  const done = await completedUnits(db, userId);
  const counts = new Map<string, number>();
  for (const d of done) counts.set(d.field_id, (counts.get(d.field_id) ?? 0) + 1);
  const grid = new Map<string, { domain: string; fields: { id: string; name: string; units: number }[] }>();
  for (const r of all) {
    const entry = grid.get(r.domainId) ?? { domain: r.domain, fields: [] };
    entry.fields.push({ id: r.fieldId, name: r.field, units: counts.get(r.fieldId) ?? 0 });
    grid.set(r.domainId, entry);
  }
  const fieldIds = new Set(done.map((d) => d.field_id));
  const domainIds = new Set(done.map((d) => d.domain_id));
  return {
    domains: [...grid.values()],
    activeFields: fieldIds.size,
    activeDomains: domainIds.size,
    level: polymathLevel(fieldIds.size, domainIds.size),
  };
}

/* ---------- follows ---------- */

export async function setFollow(db: Tx, userId: string, courseId: string, on: boolean) {
  const course = await db.query.courses.findFirst({ where: eq(courses.id, courseId) });
  if (!course) throw new AppError("not_found", "Course not found");
  if (on) await db.insert(follows).values({ userId, courseId }).onConflictDoNothing();
  else await db.delete(follows).where(and(eq(follows.userId, userId), eq(follows.courseId, courseId)));
}

export async function isFollowing(db: Tx, userId: string, courseId: string) {
  return Boolean(await db.query.follows.findFirst({ where: and(eq(follows.userId, userId), eq(follows.courseId, courseId)) }));
}

export async function followerCount(db: Tx, courseId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(follows).where(eq(follows.courseId, courseId));
  return r?.n ?? 0;
}

export async function followedCourses(db: Tx, userId: string) {
  return db
    .select({ id: courses.id, title: courses.title, slug: courses.slug })
    .from(follows)
    .innerJoin(courses, eq(courses.id, follows.courseId))
    .where(eq(follows.userId, userId))
    .orderBy(asc(courses.title));
}

/* ---------- daily cards ---------- */

export async function todaysCards(db: Tx, user: AppUser, at = new Date()) {
  const today = localDate(at, user.timezone);
  return db
    .select({
      card: dailyCards,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      reviewed: sql<boolean>`EXISTS (SELECT 1 FROM card_reviews r WHERE r.card_id = ${dailyCards.id} AND r.user_id = ${user.id})`,
    })
    .from(dailyCards)
    .innerJoin(follows, and(eq(follows.courseId, dailyCards.courseId), eq(follows.userId, user.id)))
    .innerJoin(courses, eq(courses.id, dailyCards.courseId))
    .where(eq(dailyCards.scheduledFor, today))
    .orderBy(asc(courses.title));
}

/** Reviewing today's card for a followed course counts as a streak day. */
export async function reviewCard(db: Tx, user: AppUser, cardId: string, at = new Date()) {
  const card = await db.query.dailyCards.findFirst({ where: eq(dailyCards.id, cardId) });
  if (!card) throw new AppError("not_found", "Card not found");
  if (card.scheduledFor !== localDate(at, user.timezone)) throw new AppError("invalid", "That card is not scheduled for today");
  await db.insert(cardReviews).values({ userId: user.id, cardId }).onConflictDoNothing();
  return recordActivity(db, user.id, at);
}

export async function scheduleCard(
  db: Tx,
  user: AppUser,
  courseId: string,
  input: { kind: string; body: string; answer?: string; scheduledFor: string; lessonId?: string },
) {
  await requireCourseLevel(db, user, courseId, LEVEL.editor, "schedule daily cards");
  if (!["word", "fact", "question"].includes(input.kind)) throw new AppError("invalid", "Card kind must be word, fact or question");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledFor) || Number.isNaN(Date.parse(input.scheduledFor))) {
    throw new AppError("invalid", "Choose a date");
  }
  const body = requireText(input.body, "Card text", 1, 500);
  const inserted = await db
    .insert(dailyCards)
    .values({
      courseId,
      kind: input.kind,
      body,
      answer: input.answer?.trim() || null,
      scheduledFor: input.scheduledFor,
      lessonId: input.lessonId ?? null,
      authorId: user.id,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) throw new AppError("conflict", "A card is already scheduled for that day");
  return inserted[0];
}

export async function cardQueue(db: Tx, courseId: string, fromDate: string, limit = 30) {
  return db
    .select()
    .from(dailyCards)
    .where(and(eq(dailyCards.courseId, courseId), gte(dailyCards.scheduledFor, fromDate)))
    .orderBy(asc(dailyCards.scheduledFor))
    .limit(limit);
}

/* ---------- suggestions ---------- */

/**
 * One course from a field the user has not started, ranked by request votes,
 * followers, and recent learners among people who follow the same courses.
 */
export async function suggestCourse(db: Tx, userId: string) {
  const res = await db.execute<{ id: string; title: string; slug: string; summary: string; field: string }>(sql`
    WITH started AS (
      SELECT DISTINCT c.field_id FROM progress p
      JOIN lessons l ON l.id = p.lesson_id JOIN units u ON u.id = l.unit_id JOIN courses c ON c.id = u.course_id
      WHERE p.user_id = ${userId}
    ),
    peers AS (
      SELECT DISTINCT f2.user_id FROM follows f1 JOIN follows f2 ON f2.course_id = f1.course_id
      WHERE f1.user_id = ${userId} AND f2.user_id <> ${userId}
    )
    SELECT c.id, c.title, c.slug, c.summary, fl.name AS field
    FROM courses c JOIN fields fl ON fl.id = c.field_id
    LEFT JOIN course_requests r ON r.id = c.request_id
    WHERE c.status = 'open' AND c.field_id NOT IN (SELECT field_id FROM started)
    ORDER BY
      coalesce(r.vote_count, 0)
      + (SELECT count(*) FROM follows f WHERE f.course_id = c.id)
      + 3 * (SELECT count(DISTINCT p.user_id) FROM progress p
               JOIN lessons l ON l.id = p.lesson_id JOIN units u ON u.id = l.unit_id
             WHERE u.course_id = c.id AND p.user_id IN (SELECT user_id FROM peers)
               AND p.completed_at > now() - interval '30 days') DESC,
      c.title
    LIMIT 1`);
  return res.rows[0] ?? null;
}

