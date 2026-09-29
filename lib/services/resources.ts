import { and, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { resources, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { requireText } from "@/lib/text";
import { partnerForUrl } from "./affiliates";
import { resolveScope, type Scope } from "./discussion";
import { LEVEL, courseLevel, requireCourseLevel } from "./permissions";
import type { AppUser } from "./users";

export const RESOURCE_TYPES = ["video", "course", "article", "book", "archive", "audio", "other"] as const;
export const RESOURCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type ResourceLevel = (typeof RESOURCE_LEVELS)[number];

export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new AppError("invalid", "Enter a full link starting with https://");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new AppError("invalid", "Only web links are allowed");
  u.hash = "";
  return u.toString();
}

/** Guesses a resource type from its host. */
export function inferType(url: string): ResourceType {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (/(youtube\.com|youtu\.be|vimeo\.com)$/.test(host)) return "video";
  if (/(coursera\.org|edx\.org|khanacademy\.org|udemy\.com)$/.test(host)) return "course";
  if (/(archive\.org|papakilodatabase\.com|nupepa\.org|ulukau\.org)$/.test(host)) return "archive";
  if (/(books\.google\.|openlibrary\.org|bookshop\.org|amazon\.)/.test(host)) return "book";
  if (/(soundcloud\.com|spotify\.com)$/.test(host)) return "audio";
  return "other";
}

export type ResourceInput = Scope & { url: string; title: string; type?: string; level?: string };

/** Members' links wait for an Editor; Contributors and above publish directly. */
export async function addResource(db: Tx, user: AppUser, input: ResourceInput) {
  const scope = await resolveScope(db, input);
  const url = normalizeUrl(input.url);
  const title = requireText(input.title, "Title", 2, 200);
  const type = (RESOURCE_TYPES as readonly string[]).includes(input.type ?? "")
    ? (input.type as ResourceType)
    : inferType(url);
  const level = (RESOURCE_LEVELS as readonly string[]).includes(input.level ?? "")
    ? (input.level as ResourceLevel)
    : "beginner";
  const approved = (await courseLevel(db, user, scope.courseId)) >= LEVEL.contributor;
  const partner = await partnerForUrl(db, url);
  const [r] = await db
    .insert(resources)
    .values({
      ...scope,
      url,
      title,
      type,
      level,
      addedById: user.id,
      source: "user",
      approved,
      approvedById: approved ? user.id : null,
      partnerId: partner?.id ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (!r) throw new AppError("conflict", "That link is already listed for this course");
  return r;
}

export async function reviewResource(db: Tx, user: AppUser, resourceId: string, decision: "approve" | "reject") {
  const r = await db.query.resources.findFirst({ where: eq(resources.id, resourceId) });
  if (!r) throw new AppError("not_found", "Resource not found");
  await requireCourseLevel(db, user, r.courseId, LEVEL.editor, "review resources");
  if (r.approved) throw new AppError("conflict", "Resource is already approved");
  if (decision === "reject") {
    await db.delete(resources).where(eq(resources.id, resourceId));
    return null;
  }
  const [updated] = await db
    .update(resources)
    .set({ approved: true, approvedById: user.id })
    .where(eq(resources.id, resourceId))
    .returning();
  return updated;
}

export async function listResources(db: Tx, scope: Scope, viewerId?: string) {
  const conds = [eq(resources.courseId, scope.courseId), eq(resources.approved, true)];
  if (scope.lessonId) conds.push(eq(resources.lessonId, scope.lessonId));
  else if (scope.unitId) conds.push(eq(resources.unitId, scope.unitId));
  const rows = await db
    .select({
      resource: resources,
      addedByHandle: users.handle,
      myVote: viewerId
        ? sql<number | null>`(SELECT value FROM votes v WHERE v.user_id = ${viewerId} AND v.target_type = 'resource' AND v.target_id = ${resources.id})`
        : sql<null>`NULL`,
    })
    .from(resources)
    .leftJoin(users, eq(users.id, resources.addedById))
    .where(and(...conds))
    .orderBy(desc(resources.score), desc(resources.createdAt));
  return rows;
}

export async function listPendingResources(db: Tx, courseId: string) {
  return db
    .select({ resource: resources, addedByHandle: users.handle })
    .from(resources)
    .leftJoin(users, eq(users.id, resources.addedById))
    .where(and(eq(resources.courseId, courseId), eq(resources.approved, false)))
    .orderBy(resources.source, desc(resources.createdAt));
}
