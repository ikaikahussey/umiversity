import { getDb } from "@/db";
import { isAuthorizedCron, unauthorized } from "@/lib/cron";
import { defaultEmailSender } from "@/lib/email";
import { runWeeklyDigest } from "@/lib/services/digest";

export const maxDuration = 300;

/** Weekly: digest of new threads and badges in followed courses. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return Response.json(await runWeeklyDigest(getDb(), defaultEmailSender()));
}
