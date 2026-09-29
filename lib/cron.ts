/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Requests without it are refused. */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
