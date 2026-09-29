import { getDb } from "@/db";
import { trackOutbound } from "@/lib/services/affiliates";
import { getCurrentUser } from "@/lib/session";

const UUID = /^[0-9a-f-]{36}$/i;

/** Outbound redirect for approved resources; logs affiliate clicks and adds partner tracking. */
export async function GET(_request: Request, ctx: RouteContext<"/go/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const user = await getCurrentUser();
  const out = await trackOutbound(getDb(), id, user?.id ?? null);
  if (!out) return new Response("Not found", { status: 404 });
  return new Response(null, {
    status: 302,
    headers: { location: out.url, "cache-control": "no-store", "referrer-policy": "no-referrer-when-downgrade" },
  });
}
