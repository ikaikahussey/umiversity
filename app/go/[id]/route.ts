import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { resources } from "@/db/schema";

const UUID = /^[0-9a-f-]{36}$/i;

/** Outbound redirect for approved resources. */
export async function GET(_request: Request, ctx: RouteContext<"/go/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const r = await getDb().query.resources.findFirst({ where: eq(resources.id, id) });
  if (!r || !r.approved) return new Response("Not found", { status: 404 });
  return Response.redirect(r.url, 302);
}
