import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { notifications } from "@/db/schema";

export async function notify(db: Tx, userId: string, kind: string, body: string, href?: string) {
  await db.insert(notifications).values({ userId, kind, body: body.slice(0, 300), href: href ?? null });
}

export async function listNotifications(db: Tx, userId: string, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(db: Tx, userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

export async function markAllRead(db: Tx, userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
