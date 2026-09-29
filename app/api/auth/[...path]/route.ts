import { authConfigured, getAuth } from "@/lib/auth/server";

type Ctx = { params: Promise<{ path: string[] }> };

const notConfigured = () => Response.json({ error: "Authentication is not configured" }, { status: 503 });

export function GET(request: Request, ctx: Ctx) {
  if (!authConfigured()) return notConfigured();
  return getAuth().handler().GET(request, ctx);
}

export function POST(request: Request, ctx: Ctx) {
  if (!authConfigured()) return notConfigured();
  return getAuth().handler().POST(request, ctx);
}
