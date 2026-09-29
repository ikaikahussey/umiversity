import { and, eq, ne, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { slugify } from "@/lib/text";

export type AuthIdentity = { id: string; name?: string | null; email?: string | null; image?: string | null };
export type AppUser = typeof users.$inferSelect;

const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;

async function handleTaken(db: Tx, handle: string, exceptUserId?: string) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      exceptUserId
        ? and(sql`lower(${users.handle}) = ${handle.toLowerCase()}`, ne(users.id, exceptUserId))
        : sql`lower(${users.handle}) = ${handle.toLowerCase()}`,
    )
    .limit(1);
  return rows.length > 0;
}

/** Picks a free handle derived from the user's name or email. */
export async function generateHandle(db: Tx, identity: AuthIdentity): Promise<string> {
  const base =
    slugify(identity.name || identity.email?.split("@")[0] || "learner")
      .replace(/-/g, "")
      .slice(0, 20) || "learner";
  const padded = base.length >= 3 ? base : `${base}learner`.slice(0, 20);
  if (!(await handleTaken(db, padded))) return padded;
  for (let i = 2; i < 10000; i++) {
    const candidate = `${padded}${i}`;
    if (!(await handleTaken(db, candidate))) return candidate;
  }
  throw new AppError("conflict", "could not allocate a handle");
}

/** Returns the app profile for an authenticated identity, creating it on first sign-in. */
export async function ensureUser(db: Tx, identity: AuthIdentity): Promise<AppUser> {
  const existing = await db.query.users.findFirst({ where: eq(users.id, identity.id) });
  if (existing) return existing;
  const handle = await generateHandle(db, identity);
  const [created] = await db
    .insert(users)
    .values({
      id: identity.id,
      handle,
      name: identity.name?.trim() || handle,
      email: identity.email ?? null,
      avatarUrl: identity.image ?? null,
    })
    .onConflictDoNothing({ target: users.id })
    .returning();
  if (created) return created;
  const again = await db.query.users.findFirst({ where: eq(users.id, identity.id) });
  if (!again) throw new AppError("conflict", "could not create user");
  return again;
}

export async function getUserByHandle(db: Tx, handle: string) {
  return db.query.users.findFirst({ where: sql`lower(${users.handle}) = ${handle.toLowerCase()}` });
}

export type ProfileInput = {
  handle?: string;
  name?: string;
  bio?: string;
  timezone?: string;
  weeklyGoalType?: "minutes" | "lessons";
  weeklyGoalTarget?: number;
  reminderHour?: number | null;
  notifyEmail?: boolean;
  digestEmail?: boolean;
};

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function updateProfile(db: Tx, userId: string, input: ProfileInput): Promise<AppUser> {
  const patch: Partial<typeof users.$inferInsert> = {};
  if (input.handle !== undefined) {
    const h = input.handle.trim().toLowerCase();
    if (!HANDLE_RE.test(h)) {
      throw new AppError("invalid", "Handle must be 3-30 characters: letters, digits, _ or -");
    }
    if (await handleTaken(db, h, userId)) throw new AppError("conflict", "That handle is taken");
    patch.handle = h;
  }
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (n.length < 1 || n.length > 80) throw new AppError("invalid", "Name must be 1-80 characters");
    patch.name = n;
  }
  if (input.bio !== undefined) {
    if (input.bio.length > 500) throw new AppError("invalid", "Bio must be at most 500 characters");
    patch.bio = input.bio.trim();
  }
  if (input.timezone !== undefined) {
    if (!isValidTimezone(input.timezone)) throw new AppError("invalid", "Unknown timezone");
    patch.timezone = input.timezone;
  }
  if (input.weeklyGoalType !== undefined) {
    if (!["minutes", "lessons"].includes(input.weeklyGoalType)) {
      throw new AppError("invalid", "Goal type must be minutes or lessons");
    }
    patch.weeklyGoalType = input.weeklyGoalType;
  }
  if (input.weeklyGoalTarget !== undefined) {
    const t = Math.floor(input.weeklyGoalTarget);
    if (!Number.isFinite(t) || t < 1 || t > 10000) throw new AppError("invalid", "Goal must be 1-10000");
    patch.weeklyGoalTarget = t;
  }
  if (input.reminderHour !== undefined) {
    if (input.reminderHour !== null && !(Number.isInteger(input.reminderHour) && input.reminderHour >= 0 && input.reminderHour <= 23)) {
      throw new AppError("invalid", "Reminder hour must be 0-23");
    }
    patch.reminderHour = input.reminderHour;
  }
  if (input.notifyEmail !== undefined) patch.notifyEmail = input.notifyEmail;
  if (input.digestEmail !== undefined) patch.digestEmail = input.digestEmail;

  if (Object.keys(patch).length === 0) {
    const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!u) throw new AppError("not_found", "User not found");
    return u;
  }
  const [updated] = await db.update(users).set(patch).where(eq(users.id, userId)).returning();
  if (!updated) throw new AppError("not_found", "User not found");
  return updated;
}
