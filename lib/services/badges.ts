import { and, asc, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { badgeEndorsements, badges, courseRoles, courses, fields, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { requireText } from "@/lib/text";
import { notify } from "./notifications";
import { isSiteStaff } from "./permissions";
import type { AppUser } from "./users";

export const ENDORSEMENTS_REQUIRED = 3;
export const EVIDENCE_RETENTION_DAYS = 30;
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export type EvidenceFile = { name: string; type: string; size: number; data: ArrayBuffer | Blob };
/** Stores a private file and returns its pathname; implemented with Vercel Blob in production. */
export type EvidenceStore = {
  put: (pathname: string, file: EvidenceFile) => Promise<string>;
  del: (pathname: string) => Promise<void>;
};

export type SubmitBadgeInput = {
  type: "degree" | "credential" | "community";
  fieldId: string;
  label: string;
  details?: string;
  evidence?: EvidenceFile | null;
};

export async function submitBadge(db: Tx, user: AppUser, input: SubmitBadgeInput, store: EvidenceStore) {
  if (!["degree", "credential", "community"].includes(input.type)) throw new AppError("invalid", "Unknown badge type");
  const field = input.fieldId ? await db.query.fields.findFirst({ where: eq(fields.id, input.fieldId) }) : undefined;
  if (!field) throw new AppError("invalid", "Choose a field");
  const label = requireText(input.label, "Badge label", 3, 120);
  const details = (input.details ?? "").trim().slice(0, 1000);
  const needsEvidence = input.type !== "community";
  const ev = input.evidence && input.evidence.size > 0 ? input.evidence : null;
  if (needsEvidence && !ev) throw new AppError("invalid", "Upload a diploma, transcript or credential document");
  if (ev) {
    if (!EVIDENCE_TYPES.includes(ev.type)) throw new AppError("invalid", "Evidence must be a PDF, JPEG or PNG");
    if (ev.size > EVIDENCE_MAX_BYTES) throw new AppError("invalid", "Evidence must be 5 MB or smaller");
  }
  const pending = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(badges)
    .where(and(eq(badges.userId, user.id), eq(badges.status, "pending")));
  if ((pending[0]?.n ?? 0) >= 5) throw new AppError("rate_limited", "You have 5 badges waiting for review");

  const [badge] = await db
    .insert(badges)
    .values({ userId: user.id, type: input.type, fieldId: field.id, label, details, status: "pending", display: true })
    .returning();
  if (ev) {
    const ext = ev.type === "application/pdf" ? "pdf" : ev.type === "image/png" ? "png" : "jpg";
    const pathname = await store.put(`badge-evidence/${user.id}/${badge.id}.${ext}`, ev);
    await db.update(badges).set({ evidenceBlobUrl: pathname }).where(eq(badges.id, badge.id));
    badge.evidenceBlobUrl = pathname;
  }
  return badge;
}

/** Verified degree, credential or community badge holders in a field may endorse community claims. */
async function holdsFieldBadge(db: Tx, userId: string, fieldId: string) {
  return Boolean(
    await db.query.badges.findFirst({
      where: and(
        eq(badges.userId, userId),
        eq(badges.fieldId, fieldId),
        eq(badges.status, "verified"),
        inArray(badges.type, ["degree", "credential", "community"]),
      ),
    }),
  );
}

export async function endorseBadge(db: Tx, user: AppUser, badgeId: string) {
  const b = await db.query.badges.findFirst({ where: eq(badges.id, badgeId) });
  if (!b || b.type !== "community") throw new AppError("not_found", "Community badge not found");
  if (b.status !== "pending") throw new AppError("conflict", "This badge was already decided");
  if (b.userId === user.id) throw new AppError("invalid", "You cannot endorse yourself");
  if (!b.fieldId || !(await holdsFieldBadge(db, user.id, b.fieldId))) {
    throw new AppError("forbidden", "Only verified badge holders in this field can endorse");
  }
  await db.insert(badgeEndorsements).values({ badgeId, userId: user.id }).onConflictDoNothing();
  return endorsementCount(db, badgeId);
}

export async function endorsementCount(db: Tx, badgeId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(badgeEndorsements)
    .where(eq(badgeEndorsements.badgeId, badgeId));
  return r?.n ?? 0;
}

/** Stewards of any course in the field can decide community badges; staff decide everything. */
async function canReview(db: Tx, user: AppUser, b: typeof badges.$inferSelect) {
  if (isSiteStaff(user)) return true;
  if (b.type !== "community" || !b.fieldId) return false;
  const rows = await db
    .select({ id: courseRoles.courseId })
    .from(courseRoles)
    .innerJoin(courses, eq(courses.id, courseRoles.courseId))
    .where(and(eq(courseRoles.userId, user.id), eq(courseRoles.role, "steward"), eq(courses.fieldId, b.fieldId)))
    .limit(1);
  return rows.length > 0;
}

export async function reviewBadge(db: Tx, user: AppUser, badgeId: string, decision: "verify" | "reject", now = new Date()) {
  const b = await db.query.badges.findFirst({ where: eq(badges.id, badgeId) });
  if (!b || !["degree", "credential", "community"].includes(b.type)) throw new AppError("not_found", "Badge not found");
  if (b.status !== "pending") throw new AppError("conflict", "This badge was already decided");
  if (b.userId === user.id) throw new AppError("forbidden", "You cannot review your own badge");
  if (!(await canReview(db, user, b))) throw new AppError("forbidden", "You cannot review this badge");
  if (decision === "verify" && b.type === "community" && (await endorsementCount(db, b.id)) < ENDORSEMENTS_REQUIRED) {
    throw new AppError("invalid", `Community badges need ${ENDORSEMENTS_REQUIRED} endorsements first`);
  }
  const deleteAfter = b.evidenceBlobUrl ? new Date(now.getTime() + EVIDENCE_RETENTION_DAYS * 86_400_000) : null;
  const [updated] = await db
    .update(badges)
    .set({
      status: decision === "verify" ? "verified" : "rejected",
      verifiedBy: user.id,
      decidedAt: now,
      evidenceDeleteAfter: deleteAfter,
    })
    .where(and(eq(badges.id, badgeId), eq(badges.status, "pending")))
    .returning();
  if (!updated) throw new AppError("conflict", "This badge was already decided");
  await notify(
    db,
    b.userId,
    "badge",
    decision === "verify" ? `Your badge “${b.label}” was verified.` : `Your badge “${b.label}” was not verified.`,
    "/settings/badges",
  );
  return updated;
}

export async function setBadgeDisplay(db: Tx, user: AppUser, badgeId: string, display: boolean) {
  const [b] = await db
    .update(badges)
    .set({ display })
    .where(and(eq(badges.id, badgeId), eq(badges.userId, user.id)))
    .returning();
  if (!b) throw new AppError("not_found", "Badge not found");
  return b;
}

/** Deletes evidence files 30 days after a decision. */
export async function purgeExpiredEvidence(db: Tx, store: EvidenceStore, now = new Date()) {
  const due = await db
    .select({ id: badges.id, path: badges.evidenceBlobUrl })
    .from(badges)
    .where(and(isNotNull(badges.evidenceBlobUrl), lt(badges.evidenceDeleteAfter, now)));
  for (const d of due) {
    await store.del(d.path!);
    await db.update(badges).set({ evidenceBlobUrl: null }).where(eq(badges.id, d.id));
  }
  return due.length;
}

export async function listUserBadges(db: Tx, userId: string, onlyPublic: boolean) {
  const conds = [eq(badges.userId, userId)];
  if (onlyPublic) conds.push(eq(badges.status, "verified"), eq(badges.display, true));
  return db
    .select({ badge: badges, fieldName: fields.name })
    .from(badges)
    .leftJoin(fields, eq(fields.id, badges.fieldId))
    .where(and(...conds))
    .orderBy(desc(badges.createdAt));
}

export async function pendingBadgeQueue(db: Tx) {
  return db
    .select({
      badge: badges,
      fieldName: fields.name,
      handle: users.handle,
      endorsements: sql<number>`(SELECT count(*) FROM badge_endorsements e WHERE e.badge_id = ${badges.id})::int`,
    })
    .from(badges)
    .innerJoin(users, eq(users.id, badges.userId))
    .leftJoin(fields, eq(fields.id, badges.fieldId))
    .where(and(eq(badges.status, "pending"), inArray(badges.type, ["degree", "credential", "community"])))
    .orderBy(asc(badges.createdAt));
}

export async function getBadgeForReview(db: Tx, badgeId: string) {
  const [row] = await db
    .select({ badge: badges, fieldName: fields.name, handle: users.handle, name: users.name })
    .from(badges)
    .innerJoin(users, eq(users.id, badges.userId))
    .leftJoin(fields, eq(fields.id, badges.fieldId))
    .where(eq(badges.id, badgeId));
  return row ?? null;
}

/** Whether `user` may view a badge's private evidence file. */
export async function canViewEvidence(db: Tx, user: AppUser | null, badgeId: string) {
  if (!user) return false;
  const b = await db.query.badges.findFirst({ where: eq(badges.id, badgeId) });
  if (!b || !b.evidenceBlobUrl) return false;
  return isSiteStaff(user);
}
