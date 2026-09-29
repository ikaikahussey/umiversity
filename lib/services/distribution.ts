/** Pure payout math; all amounts are integer cents. */

export const DEFAULT_POOL_PERCENT = 50;
export const USER_CAP_PERCENT = 5;
export const MINIMUM_PAYOUT_CENTS = 1000;

export function poolPercent(): number {
  const n = Number(process.env.PAYOUT_POOL_PERCENT);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : DEFAULT_POOL_PERCENT;
}

export function poolFromNetRevenue(eligibleNetCents: number, percent = poolPercent()): number {
  return Math.max(0, Math.floor((eligibleNetCents * percent) / 100));
}

export type Earner = { userId: string; points: number; carriedInCents: number };
export type Allocation = Earner & {
  shareCents: number;
  capped: boolean;
  amountCents: number;
  status: "pending" | "rolled_over";
};

/**
 * Splits the pool pro rata by points, caps each share at 5% of the pool, adds
 * any balance carried from earlier months, and rolls totals under $10 over.
 * Cap excess and rounding remainders are not redistributed.
 */
export function distribute(
  poolCents: number,
  earners: Earner[],
  opts: { capPercent?: number; minimumCents?: number } = {},
): { allocations: Allocation[]; totalPoints: number; distributedCents: number; retainedCents: number } {
  const capPercent = opts.capPercent ?? USER_CAP_PERCENT;
  const minimum = opts.minimumCents ?? MINIMUM_PAYOUT_CENTS;
  const eligible = earners.filter((e) => e.points > 0 || e.carriedInCents > 0);
  const totalPoints = eligible.reduce((s, e) => s + Math.max(0, e.points), 0);
  const cap = Math.floor((poolCents * capPercent) / 100);
  const allocations = eligible.map((e) => {
    const raw = totalPoints > 0 && e.points > 0 ? Math.floor((e.points / totalPoints) * poolCents) : 0;
    const shareCents = Math.min(raw, cap);
    const amountCents = shareCents + e.carriedInCents;
    return {
      ...e,
      shareCents,
      capped: raw > cap,
      amountCents,
      status: amountCents >= minimum ? ("pending" as const) : ("rolled_over" as const),
    };
  });
  const distributedCents = allocations.reduce((s, a) => s + a.shareCents, 0);
  return { allocations, totalPoints, distributedCents, retainedCents: poolCents - distributedCents };
}
