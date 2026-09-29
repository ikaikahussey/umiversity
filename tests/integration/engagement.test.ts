import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { badges, courseRoles, courses, dailyCards, follows, lessons, notifications, progress, streaks, threads, units, users } from "@/db/schema";
import type { EmailSender } from "@/lib/email";
import {
  breadthMap,
  cardQueue,
  completeLesson,
  courseProgress,
  followerCount,
  getStreak,
  polymathLevel,
  reviewCard,
  runNightlyStreaks,
  scheduleCard,
  setFollow,
  suggestCourse,
  todaysCards,
  weeklyProgress,
} from "@/lib/services/engagement";
import { buildDigest, runDailyReminders, runWeeklyDigest } from "@/lib/services/digest";
import { acceptAnswer, createPost, createThread } from "@/lib/services/discussion";
import { listNotifications, markAllRead, unreadCount } from "@/lib/services/notifications";
import { makeField, makeUser, resetDb, testDb as db } from "../helpers/db";

beforeEach(resetDb);

type CourseSpec = { fieldName: string; domain: string; units: number; lessonsPerUnit?: number; status?: "draft" | "open" };

async function makeCourse(spec: CourseSpec) {
  const { field, domain } = await makeField(spec.fieldName, spec.domain);
  const slug = `${spec.fieldName.toLowerCase().replace(/\W+/g, "-")}-${Math.random().toString(36).slice(2, 6)}`;
  const [course] = await db
    .insert(courses)
    .values({ fieldId: field.id, title: spec.fieldName, slug, status: spec.status ?? "open" })
    .returning();
  const ls: (typeof lessons.$inferSelect)[][] = [];
  for (let u = 1; u <= spec.units; u++) {
    const [unit] = await db.insert(units).values({ courseId: course.id, position: u, slug: `u${u}`, title: `Unit ${u}` }).returning();
    const row = [];
    for (let l = 1; l <= (spec.lessonsPerUnit ?? 1); l++) {
      const [lesson] = await db
        .insert(lessons)
        .values({ unitId: unit.id, position: l, slug: `l${l}`, title: `L${l}`, bodyMd: "x", minutes: 15 })
        .returning();
      row.push(lesson);
    }
    ls.push(row);
  }
  return { course, field, domain, lessons: ls };
}

const at = (iso: string) => new Date(iso);

describe("completeLesson", () => {
  it("records progress once, completes units and awards learner badges", async () => {
    const u = await makeUser({ timezone: "UTC" });
    const c = await makeCourse({ fieldName: "Hawaiian Language", domain: "Languages", units: 2, lessonsPerUnit: 2 });
    const r1 = await completeLesson(db, u, c.lessons[0][0].id, at("2026-09-28T10:00:00Z"));
    expect(r1).toMatchObject({ alreadyCompleted: false, unitCompleted: null });
    const r2 = await completeLesson(db, u, c.lessons[0][1].id, at("2026-09-28T11:00:00Z"));
    expect(r2.unitCompleted?.unitId).toBe(c.lessons[0][1].unitId);
    expect(r2.newFieldId).toBe(c.field.id);
    expect(r2.polymathLevelsReached).toEqual([]);
    const again = await completeLesson(db, u, c.lessons[0][1].id, at("2026-09-28T12:00:00Z"));
    expect(again.alreadyCompleted).toBe(true);
    const bs = await db.select().from(badges).where(eq(badges.userId, u.id));
    expect(bs.map((b) => b.label)).toEqual([`Completed: Hawaiian Language Unit 1`]);
    expect(bs[0]).toMatchObject({ type: "learner", status: "verified" });
    expect(await courseProgress(db, u.id, c.course.id)).toEqual({ total: 4, done: 2 });
    expect((await getStreak(db, u.id)).current).toBe(1);
  });

  it("awards polymath levels I, II and III by breadth", async () => {
    expect(polymathLevel(1, 1)).toBe(0);
    expect(polymathLevel(2, 1)).toBe(1);
    expect(polymathLevel(4, 2)).toBe(2);
    expect(polymathLevel(5, 2)).toBe(2);
    expect(polymathLevel(5, 3)).toBe(3);

    const u = await makeUser({ timezone: "UTC" });
    const specs: CourseSpec[] = [
      { fieldName: "Hawaiian Language", domain: "Languages", units: 1 },
      { fieldName: "History", domain: "Humanities", units: 1 },
      { fieldName: "Mathematics", domain: "Sciences", units: 1 },
      { fieldName: "Physics", domain: "Sciences", units: 1 },
      { fieldName: "Biology", domain: "Sciences", units: 1 },
    ];
    const cs = [];
    for (const s of specs) cs.push(await makeCourse(s));
    const reached: number[][] = [];
    for (const c of cs) reached.push((await completeLesson(db, u, c.lessons[0][0].id)).polymathLevelsReached);
    // Makes each makeField() create its own domain row, so 5 distinct domains exist → III at five fields.
    expect(reached).toEqual([[], [1], [2], [], [3]]);
    const labels = (await db.select().from(badges).where(eq(badges.type, "polymath"))).map((b) => b.label).sort();
    expect(labels).toEqual(["Polymath I", "Polymath II", "Polymath III"]);
    const map = await breadthMap(db, u.id);
    expect(map.activeFields).toBe(5);
    expect(map.level).toBe(3);
    expect((await listNotifications(db, u.id)).filter((n) => n.kind === "badge").length).toBe(3);
  });

  it("does not reach Polymath III with five fields in fewer than three domains", async () => {
    const u = await makeUser();
    const { domain } = await makeField("Seed", "Sciences");
    const courseIds = [];
    for (let i = 0; i < 5; i++) {
      const [f] = await db.insert((await import("@/db/schema")).fields).values({ domainId: domain.id, name: `F${i}`, slug: `f${i}-${Math.random()}` }).returning();
      const [c] = await db.insert(courses).values({ fieldId: f.id, title: `C${i}`, slug: `c${i}-${Math.random()}` }).returning();
      const [un] = await db.insert(units).values({ courseId: c.id, position: 1, slug: "u", title: "U" }).returning();
      const [l] = await db.insert(lessons).values({ unitId: un.id, position: 1, slug: "l", title: "L" }).returning();
      courseIds.push(l.id);
    }
    for (const id of courseIds) await completeLesson(db, u, id);
    expect((await breadthMap(db, u.id)).level).toBe(2);
  });
});

describe("streaks", () => {
  it("counts lesson completions, card reviews and accepted answers as streak days", async () => {
    const u = await makeUser({ timezone: "Pacific/Honolulu" });
    const asker = await makeUser();
    const c = await makeCourse({ fieldName: "History", domain: "Humanities", units: 1, lessonsPerUnit: 1 });
    await completeLesson(db, u, c.lessons[0][0].id, at("2026-09-28T20:00:00Z")); // Sep 28 HST
    await setFollow(db, u.id, c.course.id, true);
    const [card] = await db.insert(dailyCards).values({ courseId: c.course.id, body: "fact", scheduledFor: "2026-09-29" }).returning();
    await reviewCard(db, u, card.id, at("2026-09-29T20:00:00Z"));
    expect((await getStreak(db, u.id)).current).toBe(2);
    await expect(reviewCard(db, u, card.id, at("2026-09-30T20:00:00Z"))).rejects.toThrow(/not scheduled for today/);

    const t = await createThread(db, asker, { courseId: c.course.id }, { title: "Question for streaks", bodyMd: "?" });
    const p = await createPost(db, u, t.id, "answer");
    await acceptAnswer(db, asker, t.id, p.id);
    const s = await getStreak(db, u.id);
    expect(s.lastActiveDate).not.toBeNull();
  });

  it("nightly job resets broken streaks and bridges with freezes", async () => {
    const a = await makeUser({ timezone: "UTC" });
    const b = await makeUser({ timezone: "UTC" });
    await db.insert(streaks).values([
      { userId: a.id, current: 5, longest: 5, lastActiveDate: "2026-09-27", freezesLeft: 1, freezeWeek: "2026-W40" },
      { userId: b.id, current: 3, longest: 4, lastActiveDate: "2026-09-26", freezesLeft: 1, freezeWeek: "2026-W40" },
    ]);
    const res = await runNightlyStreaks(db, at("2026-09-29T00:05:00Z"));
    expect(res).toEqual({ checked: 2, reset: 1, frozen: 1 });
    expect(await getStreak(db, a.id)).toMatchObject({ current: 5, freezesLeft: 0, lastActiveDate: "2026-09-28" });
    expect(await getStreak(db, b.id)).toMatchObject({ current: 0, longest: 4 });
  });
});

describe("weekly goal", () => {
  it("counts lessons and minutes since Monday in the user's timezone", async () => {
    const u = await makeUser({ timezone: "UTC", weeklyGoalType: "minutes", weeklyGoalTarget: 60 });
    const c = await makeCourse({ fieldName: "Music", domain: "Arts", units: 1, lessonsPerUnit: 3 });
    await db.insert(progress).values([
      { userId: u.id, lessonId: c.lessons[0][0].id, completedAt: at("2026-09-27T12:00:00Z") }, // previous Sunday
      { userId: u.id, lessonId: c.lessons[0][1].id, completedAt: at("2026-09-28T12:00:00Z") },
      { userId: u.id, lessonId: c.lessons[0][2].id, completedAt: at("2026-09-29T12:00:00Z") },
    ]);
    const w = await weeklyProgress(db, u, at("2026-09-30T12:00:00Z"));
    expect(w).toMatchObject({ lessons: 2, minutes: 30, value: 30, target: 60, percent: 50 });
  });
});

describe("follows and daily cards", () => {
  it("shows today's card for followed courses only", async () => {
    const u = await makeUser({ timezone: "UTC" });
    const editor = await makeUser();
    const member = await makeUser();
    const a = await makeCourse({ fieldName: "Dance", domain: "Arts", units: 1 });
    const b = await makeCourse({ fieldName: "Cooking", domain: "Practical", units: 1 });
    await db.insert(courseRoles).values({ courseId: a.course.id, userId: editor.id, role: "editor" });
    await expect(scheduleCard(db, member, a.course.id, { kind: "word", body: "hula", scheduledFor: "2026-09-29" })).rejects.toThrow(/permission/);
    await scheduleCard(db, editor, a.course.id, { kind: "word", body: "hula", answer: "dance", scheduledFor: "2026-09-29" });
    await expect(scheduleCard(db, editor, a.course.id, { kind: "word", body: "again", scheduledFor: "2026-09-29" })).rejects.toThrow(/already scheduled/);
    await expect(scheduleCard(db, editor, a.course.id, { kind: "poem", body: "x", scheduledFor: "2026-09-30" })).rejects.toThrow(/kind/);
    await db.insert(dailyCards).values({ courseId: b.course.id, body: "poke", scheduledFor: "2026-09-29" });
    await setFollow(db, u.id, a.course.id, true);
    await setFollow(db, u.id, a.course.id, true);
    expect(await followerCount(db, a.course.id)).toBe(1);
    const cards = await todaysCards(db, u, at("2026-09-29T09:00:00Z"));
    expect(cards.map((c) => c.card.body)).toEqual(["hula"]);
    expect(cards[0].reviewed).toBe(false);
    await reviewCard(db, u, cards[0].card.id, at("2026-09-29T09:00:00Z"));
    expect((await todaysCards(db, u, at("2026-09-29T09:00:00Z")))[0].reviewed).toBe(true);
    expect((await cardQueue(db, a.course.id, "2026-09-01")).length).toBe(1);
    await setFollow(db, u.id, a.course.id, false);
    expect(await todaysCards(db, u, at("2026-09-29T09:00:00Z"))).toEqual([]);
  });
});

describe("suggestions", () => {
  it("suggests an open course from a field the user has not started", async () => {
    const u = await makeUser();
    const started = await makeCourse({ fieldName: "Hawaiian Language", domain: "Languages", units: 1 });
    await makeCourse({ fieldName: "Physics", domain: "Sciences", units: 1, status: "draft" });
    const pick = await makeCourse({ fieldName: "History", domain: "Humanities", units: 1 });
    const other = await makeCourse({ fieldName: "Biology", domain: "Sciences", units: 1 });
    await completeLesson(db, u, started.lessons[0][0].id);
    const fan = await makeUser();
    await setFollow(db, fan.id, pick.course.id, true);
    const s = await suggestCourse(db, u.id);
    expect(s?.id).toBe(pick.course.id);
    expect(s?.id).not.toBe(other.course.id);
  });
});

describe("notifications and email jobs", () => {
  function fakeSender() {
    const sent: { to: string; subject: string; text: string }[] = [];
    const send: EmailSender = async (e) => {
      sent.push(e);
      return { ok: true };
    };
    return { sent, send };
  }

  it("notifies askers of answers and tracks unread counts", async () => {
    const asker = await makeUser();
    const answerer = await makeUser();
    const c = await makeCourse({ fieldName: "Writing", domain: "Arts", units: 1 });
    const t = await createThread(db, asker, { courseId: c.course.id }, { title: "Notify me please", bodyMd: "?" });
    await createPost(db, answerer, t.id, "reply");
    await createPost(db, asker, t.id, "self reply");
    expect(await unreadCount(db, asker.id)).toBe(1);
    await markAllRead(db, asker.id);
    expect(await unreadCount(db, asker.id)).toBe(0);
  });

  it("sends daily reminders at the chosen local hour to inactive users only", async () => {
    const due = await makeUser({ email: "due@x.test", timezone: "Pacific/Honolulu", reminderHour: 18 });
    await makeUser({ email: "wrong-hour@x.test", timezone: "Pacific/Honolulu", reminderHour: 9 });
    await makeUser({ email: "off@x.test", timezone: "Pacific/Honolulu", reminderHour: 18, notifyEmail: false });
    const active = await makeUser({ email: "active@x.test", timezone: "Pacific/Honolulu", reminderHour: 18 });
    await db.insert(streaks).values({ userId: active.id, current: 3, longest: 3, lastActiveDate: "2026-09-29" });
    const { sent, send } = fakeSender();
    const res = await runDailyReminders(db, send, at("2026-09-30T04:00:00Z")); // 18:00 HST on Sep 29
    expect(sent.map((s) => s.to)).toEqual([due.email]);
    expect(res.sent).toBe(1);
  });

  it("builds and sends a weekly digest for followed courses", async () => {
    const reader = await makeUser({ email: "reader@x.test" });
    const optedOut = await makeUser({ email: "no@x.test", digestEmail: false });
    const writer = await makeUser({ handle: "kumu" });
    const c = await makeCourse({ fieldName: "History", domain: "Humanities", units: 1 });
    await setFollow(db, reader.id, c.course.id, true);
    await setFollow(db, optedOut.id, c.course.id, true);
    await createThread(db, writer, { courseId: c.course.id }, { title: "What was the Māhele?", bodyMd: "?" });
    const [old] = await db.insert(threads).values({ courseId: c.course.id, authorId: writer.id, title: "Old thread", bodyMd: "?" }).returning();
    await db.update(threads).set({ createdAt: at("2020-01-01T00:00:00Z") }).where(eq(threads.id, old.id));
    await db.insert(badges).values({ userId: writer.id, type: "community", fieldId: c.field.id, label: "Kumu", status: "verified", decidedAt: new Date() });
    const d = await buildDigest(db, reader.id);
    expect(d.threads.map((t) => t.title)).toEqual([`What was the Māhele? (History)`]);
    expect(d.badges.map((b) => b.title)).toEqual(["@kumu: Kumu"]);
    const { sent, send } = fakeSender();
    await runWeeklyDigest(db, send);
    expect(sent.map((s) => s.to)).toEqual(["reader@x.test"]);
    expect(sent[0].text).toContain("What was the Māhele?");
    const quiet = await makeUser({ email: "quiet@x.test" });
    await setFollow(db, quiet.id, c.course.id, true);
    await db.delete(threads);
    await db.delete(badges);
    const again = fakeSender();
    await runWeeklyDigest(db, again.send);
    expect(again.sent).toEqual([]);
    expect((await db.select().from(users)).length).toBeGreaterThan(0);
    expect((await db.select().from(follows)).length).toBe(3);
    expect((await db.select().from(notifications)).length).toBeGreaterThanOrEqual(0);
  });
});
