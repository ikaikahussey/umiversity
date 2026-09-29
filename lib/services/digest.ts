import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { streaks, users } from "@/db/schema";
import { localDate, localHour } from "@/lib/dates";
import { appUrl, type EmailSender } from "@/lib/email";

/**
 * Emails users who opted into reminders and have not been active today.
 * Hourly mode (Vercel Pro) sends only to users whose chosen local hour is now;
 * daily mode (one run per day, Hobby-compatible) sends to all of them.
 */
export async function runDailyReminders(db: Tx, send: EmailSender, at = new Date(), opts: { hourly?: boolean } = {}) {
  const hourly = opts.hourly ?? true;
  const rows = await db
    .select({ user: users, last: streaks.lastActiveDate, current: streaks.current })
    .from(users)
    .leftJoin(streaks, eq(streaks.userId, users.id))
    .where(and(eq(users.notifyEmail, true), isNotNull(users.reminderHour), isNotNull(users.email)));
  let sent = 0;
  for (const { user, last, current } of rows) {
    if (hourly && localHour(at, user.timezone) !== user.reminderHour) continue;
    if (last === localDate(at, user.timezone)) continue;
    const streakLine = current ? `Keep your ${current}-day streak going.` : "Start a streak today.";
    const res = await send({
      to: user.email!,
      subject: "Your daily lesson is waiting",
      text: `Aloha ${user.name},\n\n${streakLine} Review today's card or finish a lesson:\n${appUrl("/")}\n\nChange reminders: ${appUrl("/settings")}`,
    });
    if (res.ok) sent++;
  }
  return { considered: rows.length, sent };
}

type DigestItem = { title: string; href: string };

export async function buildDigest(db: Tx, userId: string, at = new Date()) {
  const since = new Date(at.getTime() - 7 * 86_400_000);
  const threads = await db.execute<{ title: string; course_slug: string; id: string; course_title: string }>(sql`
    SELECT t.id, t.title, c.slug AS course_slug, c.title AS course_title
    FROM threads t JOIN courses c ON c.id = t.course_id
    JOIN follows f ON f.course_id = c.id AND f.user_id = ${userId}
    WHERE t.created_at > ${since} AND t.author_id <> ${userId}
    ORDER BY t.score DESC, t.created_at DESC LIMIT 10`);
  const badgeRows = await db.execute<{ label: string; handle: string }>(sql`
    SELECT DISTINCT b.label, u.handle
    FROM badges b JOIN users u ON u.id = b.user_id
    WHERE b.status = 'verified' AND b.display AND b.decided_at > ${since}
      AND b.type IN ('degree', 'credential', 'community', 'contributor')
      AND (b.field_id IN (SELECT c.field_id FROM follows f JOIN courses c ON c.id = f.course_id WHERE f.user_id = ${userId})
        OR b.course_id IN (SELECT course_id FROM follows WHERE user_id = ${userId}))
    LIMIT 10`);
  const threadItems: DigestItem[] = threads.rows.map((t) => ({
    title: `${t.title} (${t.course_title})`,
    href: appUrl(`/c/${t.course_slug}/q/${t.id}`),
  }));
  const badgeItems: DigestItem[] = badgeRows.rows.map((b) => ({ title: `@${b.handle}: ${b.label}`, href: appUrl(`/u/${b.handle}`) }));
  return { threads: threadItems, badges: badgeItems };
}

/** Weekly job: new threads and badges in each user's followed courses. */
export async function runWeeklyDigest(db: Tx, send: EmailSender, at = new Date()) {
  const recipients = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.digestEmail, true),
        isNotNull(users.email),
        sql`EXISTS (SELECT 1 FROM follows f WHERE f.user_id = ${users.id})`,
      ),
    );
  let sent = 0;
  for (const u of recipients) {
    const d = await buildDigest(db, u.id, at);
    if (d.threads.length === 0 && d.badges.length === 0) continue;
    const lines = [
      `Aloha ${u.name}, here is your week in the courses you follow.`,
      "",
      ...(d.threads.length ? ["New questions:", ...d.threads.map((t) => `- ${t.title}: ${t.href}`), ""] : []),
      ...(d.badges.length ? ["New badges:", ...d.badges.map((b) => `- ${b.title}`), ""] : []),
      `Turn off the digest: ${appUrl("/settings")}`,
    ];
    const res = await send({ to: u.email!, subject: "Your weekly Umiversity digest", text: lines.join("\n") });
    if (res.ok) sent++;
  }
  return { recipients: recipients.length, sent };
}
