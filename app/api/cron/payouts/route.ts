import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payoutPeriods } from "@/db/schema";
import { isAuthorizedCron, unauthorized } from "@/lib/cron";
import { computeMonthlyPayout, executeTransfers, settleableMonth } from "@/lib/services/payouts";
import { clearMaturedPoints } from "@/lib/services/points";
import { stripeClient } from "@/lib/stripe";

export const maxDuration = 300;

/**
 * Monthly: clears points past their 30-day hold, computes the month whose
 * points have all cleared (two months back), then sends Stripe transfers.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  const db = getDb();
  const cleared = await clearMaturedPoints(db);
  const month = settleableMonth();
  let computed: string | { poolCents: number; payees: number } = "already computed";
  if (!(await db.query.payoutPeriods.findFirst({ where: eq(payoutPeriods.month, month) }))) {
    const r = await computeMonthlyPayout(db, month);
    computed = { poolCents: r.period.poolCents, payees: r.allocations.filter((a) => a.status === "pending").length };
  }
  const transfers = process.env.STRIPE_SECRET_KEY
    ? await executeTransfers(db, stripeClient())
    : "skipped: STRIPE_SECRET_KEY not set";
  return Response.json({ cleared, month, computed, transfers });
}
