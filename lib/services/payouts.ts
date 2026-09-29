import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { payoutAccounts, payoutPeriods, payouts, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { StripeClient } from "@/lib/stripe";
import { revenueForMonth } from "./affiliates";
import { distribute, poolFromNetRevenue } from "./distribution";
import { requireStaff } from "./permissions";
import { clearMaturedPoints } from "./points";
import type { AppUser } from "./users";

/** Points earned in an account's first 30 days are not payout-eligible. */
export const NEW_ACCOUNT_DAYS = 30;

export function isNewAccount(createdAt: Date, now = new Date()): boolean {
  return now.getTime() - createdAt.getTime() < NEW_ACCOUNT_DAYS * 86_400_000;
}

function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError("invalid", "Month must be YYYY-MM");
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

/** The month whose points have all cleared their 30-day hold by `now` (two months back). */
export function settleableMonth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Computes a month's payouts: pool = configured share of net revenue received
 * that month from payout-eligible partners; split by cleared points earned in
 * the month, excluding frozen users and points earned in an account's first
 * 30 days; 5% per-user cap; totals under $10 roll over.
 */
export async function computeMonthlyPayout(db: Tx, month: string, now = new Date()) {
  const { start, end } = monthBounds(month);
  if (now < end) throw new AppError("invalid", "That month has not ended");
  if (await db.query.payoutPeriods.findFirst({ where: eq(payoutPeriods.month, month) })) {
    throw new AppError("conflict", `Payouts for ${month} were already computed`);
  }
  await clearMaturedPoints(db, now);
  const { eligibleNetCents } = await revenueForMonth(db, month);
  const poolCents = poolFromNetRevenue(eligibleNetCents);

  const earned = await db.execute<{ user_id: string; points: string }>(sql`
    SELECT pe.user_id, sum(pe.points) AS points
    FROM point_events pe JOIN users u ON u.id = pe.user_id
    WHERE pe.status = 'cleared'
      AND pe.created_at >= ${start} AND pe.created_at < ${end}
      AND NOT u.points_frozen
      AND pe.created_at >= u.created_at + make_interval(days => ${NEW_ACCOUNT_DAYS})
    GROUP BY pe.user_id`);
  const carried = await db.execute<{ user_id: string; cents: string }>(sql`
    SELECT p.user_id, sum(p.amount_cents) AS cents
    FROM payouts p JOIN users u ON u.id = p.user_id
    WHERE p.status = 'rolled_over' AND NOT u.points_frozen
    GROUP BY p.user_id`);

  const byUser = new Map<string, { points: number; carriedInCents: number }>();
  for (const r of earned.rows) byUser.set(r.user_id, { points: Number(r.points), carriedInCents: 0 });
  for (const r of carried.rows) {
    const e = byUser.get(r.user_id) ?? { points: 0, carriedInCents: 0 };
    e.carriedInCents = Number(r.cents);
    byUser.set(r.user_id, e);
  }
  const result = distribute(
    poolCents,
    [...byUser.entries()].map(([userId, e]) => ({ userId, ...e })),
  );

  return db.transaction(async (tx) => {
    const [period] = await tx
      .insert(payoutPeriods)
      .values({ month, poolCents, totalPoints: result.totalPoints, status: "computed" })
      .returning();
    const carriedUsers = result.allocations.filter((a) => a.carriedInCents > 0).map((a) => a.userId);
    if (carriedUsers.length) {
      await tx
        .update(payouts)
        .set({ status: "carried" })
        .where(and(eq(payouts.status, "rolled_over"), inArray(payouts.userId, carriedUsers)));
    }
    if (result.allocations.length) {
      await tx.insert(payouts).values(
        result.allocations.map((a) => ({
          periodId: period.id,
          userId: a.userId,
          points: a.points,
          amountCents: a.amountCents,
          carriedInCents: a.carriedInCents,
          status: a.status,
        })),
      );
    }
    return { period, ...result };
  });
}

/** Sends Stripe transfers for pending payouts whose owners finished onboarding. */
export async function executeTransfers(db: Tx, stripe: StripeClient) {
  const due = await db
    .select({ payout: payouts, month: payoutPeriods.month, account: payoutAccounts, frozen: users.pointsFrozen })
    .from(payouts)
    .innerJoin(payoutPeriods, eq(payoutPeriods.id, payouts.periodId))
    .innerJoin(users, eq(users.id, payouts.userId))
    .leftJoin(payoutAccounts, eq(payoutAccounts.userId, payouts.userId))
    .where(inArray(payouts.status, ["pending", "failed"]))
    .orderBy(asc(payouts.createdAt));
  const out = { paid: 0, waitingForOnboarding: 0, failed: 0, frozen: 0 };
  for (const d of due) {
    if (d.frozen) {
      out.frozen++;
      continue;
    }
    if (!d.account || d.account.onboardingStatus !== "complete") {
      out.waitingForOnboarding++;
      continue;
    }
    try {
      const t = await stripe.createTransfer({
        amountCents: d.payout.amountCents,
        destination: d.account.stripeAccountId,
        transferGroup: `payout-${d.month}`,
        idempotencyKey: `payout-${d.payout.id}`,
      });
      await db.update(payouts).set({ status: "paid", stripeTransferId: t.id }).where(eq(payouts.id, d.payout.id));
      out.paid++;
    } catch {
      await db.update(payouts).set({ status: "failed" }).where(eq(payouts.id, d.payout.id));
      out.failed++;
    }
  }
  const periods = await db.execute(sql`
    UPDATE payout_periods pp SET status = 'paid'
    WHERE pp.status = 'computed'
      AND NOT EXISTS (SELECT 1 FROM payouts p WHERE p.period_id = pp.id AND p.status IN ('pending', 'failed'))`);
  return { ...out, periodsClosed: periods.rowCount ?? 0 };
}

/** Starts or resumes Stripe Express onboarding; returns the hosted onboarding URL. */
export async function startOnboarding(db: Tx, user: AppUser, stripe: StripeClient, urls: { refresh: string; return: string }) {
  let acct = await db.query.payoutAccounts.findFirst({ where: eq(payoutAccounts.userId, user.id) });
  if (!acct) {
    const created = await stripe.createExpressAccount({ email: user.email, userId: user.id });
    [acct] = await db
      .insert(payoutAccounts)
      .values({ userId: user.id, stripeAccountId: created.id, onboardingStatus: "pending" })
      .onConflictDoNothing()
      .returning();
    acct ??= await db.query.payoutAccounts.findFirst({ where: eq(payoutAccounts.userId, user.id) });
  }
  const link = await stripe.createAccountLink({ account: acct!.stripeAccountId, refreshUrl: urls.refresh, returnUrl: urls.return });
  return link.url;
}

/** Refreshes onboarding status from Stripe (identity and tax details submitted, payouts enabled). */
export async function syncOnboarding(db: Tx, userId: string, stripe: StripeClient) {
  const acct = await db.query.payoutAccounts.findFirst({ where: eq(payoutAccounts.userId, userId) });
  if (!acct) return null;
  const a = await stripe.retrieveAccount(acct.stripeAccountId);
  const status = a.payoutsEnabled && a.detailsSubmitted ? "complete" : "pending";
  await db.update(payoutAccounts).set({ onboardingStatus: status }).where(eq(payoutAccounts.userId, userId));
  return status;
}

export async function userPayouts(db: Tx, userId: string) {
  return db
    .select({ payout: payouts, month: payoutPeriods.month })
    .from(payouts)
    .innerJoin(payoutPeriods, eq(payoutPeriods.id, payouts.periodId))
    .where(eq(payouts.userId, userId))
    .orderBy(desc(payoutPeriods.month));
}

export async function listPeriods(db: Tx) {
  return db
    .select({
      period: payoutPeriods,
      payees: sql<number>`(SELECT count(*) FROM payouts p WHERE p.period_id = ${payoutPeriods.id} AND p.status IN ('pending','paid','failed'))::int`,
      paidCents: sql<number>`(SELECT coalesce(sum(amount_cents),0) FROM payouts p WHERE p.period_id = ${payoutPeriods.id} AND p.status = 'paid')::int`,
    })
    .from(payoutPeriods)
    .orderBy(desc(payoutPeriods.month));
}

export async function computeMonthlyPayoutAsStaff(db: Tx, actor: AppUser, month: string) {
  requireStaff(actor, "compute payouts");
  return computeMonthlyPayout(db, month);
}
