import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { badges } from "@/db/schema";
import { canViewEvidence } from "@/lib/services/badges";
import { getCurrentUser } from "@/lib/session";

const UUID = /^[0-9a-f-]{36}$/i;

/** Streams private badge evidence to moderators and admins only. */
export async function GET(_request: Request, ctx: RouteContext<"/api/badges/[id]/evidence">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const db = getDb();
  const user = await getCurrentUser();
  if (!(await canViewEvidence(db, user, id))) return new Response("Forbidden", { status: 403 });
  const badge = await db.query.badges.findFirst({ where: eq(badges.id, id) });
  const file = await get(badge!.evidenceBlobUrl!, { access: "private" });
  if (!file || file.statusCode !== 200) return new Response("Not found", { status: 404 });
  return new Response(file.stream, {
    headers: {
      "content-type": file.blob.contentType ?? "application/octet-stream",
      "cache-control": "private, no-store",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'; img-src 'self' data:; object-src 'self'",
    },
  });
}
