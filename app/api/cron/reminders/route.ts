import { getDb } from "@/db";
import { isAuthorizedCron, unauthorized } from "@/lib/cron";
import { defaultEmailSender } from "@/lib/email";
import { runDailyReminders } from "@/lib/services/digest";

export const maxDuration = 300;

/** Hourly: daily reminder emails at each user's chosen local hour. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return Response.json(await runDailyReminders(getDb(), defaultEmailSender()));
}
