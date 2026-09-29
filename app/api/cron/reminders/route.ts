import { getDb } from "@/db";
import { isAuthorizedCron, unauthorized } from "@/lib/cron";
import { defaultEmailSender } from "@/lib/email";
import { runDailyReminders } from "@/lib/services/digest";

export const maxDuration = 300;

/**
 * Reminder emails. Set REMINDER_CRON_HOURLY=1 and an hourly schedule (Vercel Pro)
 * to honor each user's chosen hour; otherwise one daily run reaches everyone opted in.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  return Response.json(await runDailyReminders(getDb(), defaultEmailSender(), new Date(), {
      hourly: process.env.REMINDER_CRON_HOURLY === "1",
    }));
}
