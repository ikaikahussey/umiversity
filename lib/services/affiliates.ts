import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { affiliateClicks, affiliatePartners, affiliateRevenue, resources } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { requireText } from "@/lib/text";
import { requireStaff } from "./permissions";
import type { AppUser } from "./users";

function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

function matchesDomain(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

export async function partnerForUrl(db: Tx, url: string) {
  const host = hostOf(url);
  const partners = await db.select().from(affiliatePartners);
  return partners.find((p) => matchesDomain(host, p.domain)) ?? null;
}

export type PartnerInput = {
  name: string;
  network: string;
  domain: string;
  trackingParam?: string;
  payoutEligible: boolean;
  termsNote?: string;
};

/** Creates or updates a partner and links existing resources on its domain. */
export async function upsertPartner(db: Tx, actor: AppUser, input: PartnerInput) {
  requireStaff(actor, "manage affiliate partners");
  const name = requireText(input.name, "Partner name", 2, 80);
  const network = requireText(input.network, "Network", 2, 80);
  const domain = input.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new AppError("invalid", "Enter a domain like coursera.org");
  const trackingParam = input.trackingParam?.trim() || null;
  if (trackingParam && !/^[\w.-]+=[\w.-]+$/.test(trackingParam)) {
    throw new AppError("invalid", "Tracking parameter must look like key=value");
  }
  const [p] = await db
    .insert(affiliatePartners)
    .values({ name, network, domain, trackingParam, payoutEligible: input.payoutEligible, termsNote: input.termsNote ?? "" })
    .onConflictDoUpdate({
      target: affiliatePartners.domain,
      set: { name, network, trackingParam, payoutEligible: input.payoutEligible, termsNote: input.termsNote ?? "" },
    })
    .returning();
  const unlinked = await db.select({ id: resources.id, url: resources.url }).from(resources).where(isNull(resources.partnerId));
  for (const r of unlinked) {
    if (matchesDomain(hostOf(r.url), domain)) {
      await db.update(resources).set({ partnerId: p.id }).where(eq(resources.id, r.id));
    }
  }
  return p;
}

export async function listPartners(db: Tx) {
  return db.select().from(affiliatePartners).orderBy(asc(affiliatePartners.name));
}

/** Outbound URL with the partner's tracking parameter, plus a click record. */
export async function trackOutbound(db: Tx, resourceId: string, userId: string | null) {
  const r = await db.query.resources.findFirst({ where: and(eq(resources.id, resourceId), eq(resources.approved, true)) });
  if (!r) return null;
  let partner = r.partnerId ? await db.query.affiliatePartners.findFirst({ where: eq(affiliatePartners.id, r.partnerId) }) : null;
  if (!partner) {
    partner = await partnerForUrl(db, r.url);
    if (partner) await db.update(resources).set({ partnerId: partner.id }).where(eq(resources.id, r.id));
  }
  if (!partner) return { url: r.url, tracked: false };
  await db.insert(affiliateClicks).values({ partnerId: partner.id, resourceId: r.id, userId });
  if (!partner.trackingParam) return { url: r.url, tracked: true };
  const u = new URL(r.url);
  const [k, v] = partner.trackingParam.split("=");
  u.searchParams.set(k, v);
  return { url: u.toString(), tracked: true };
}

export type RevenueInput = {
  partnerId: string;
  month: string;
  grossCents: number;
  reversalsCents: number;
  receivedAt: Date;
};

/** Records commission cash received from a network, net of refunds and reversals. */
export async function recordRevenue(db: Tx, actor: AppUser, input: RevenueInput) {
  requireStaff(actor, "record revenue");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new AppError("invalid", "Month must be YYYY-MM");
  if (!Number.isInteger(input.grossCents) || input.grossCents < 0) throw new AppError("invalid", "Gross must be a positive amount");
  if (!Number.isInteger(input.reversalsCents) || input.reversalsCents < 0) throw new AppError("invalid", "Reversals must be zero or more");
  const partner = await db.query.affiliatePartners.findFirst({ where: eq(affiliatePartners.id, input.partnerId) });
  if (!partner) throw new AppError("not_found", "Partner not found");
  const [row] = await db
    .insert(affiliateRevenue)
    .values({
      partnerId: partner.id,
      network: partner.network,
      month: input.month,
      grossCents: input.grossCents,
      reversalsCents: input.reversalsCents,
      netCents: input.grossCents - input.reversalsCents,
      receivedAt: input.receivedAt,
    })
    .returning();
  return row;
}

/** Net revenue for a month, split by whether the partner allows sharing with users. */
export async function revenueForMonth(db: Tx, month: string) {
  const res = await db.execute<{ eligible: string; ineligible: string }>(sql`
    SELECT coalesce(sum(r.net_cents) FILTER (WHERE p.payout_eligible), 0) AS eligible,
           coalesce(sum(r.net_cents) FILTER (WHERE NOT p.payout_eligible), 0) AS ineligible
    FROM affiliate_revenue r JOIN affiliate_partners p ON p.id = r.partner_id
    WHERE r.month = ${month}`);
  return { eligibleNetCents: Number(res.rows[0]?.eligible ?? 0), ineligibleNetCents: Number(res.rows[0]?.ineligible ?? 0) };
}

export async function listRevenue(db: Tx, limit = 50) {
  return db
    .select({ revenue: affiliateRevenue, partnerName: affiliatePartners.name, eligible: affiliatePartners.payoutEligible })
    .from(affiliateRevenue)
    .innerJoin(affiliatePartners, eq(affiliatePartners.id, affiliateRevenue.partnerId))
    .orderBy(desc(affiliateRevenue.month), desc(affiliateRevenue.receivedAt))
    .limit(limit);
}

export async function clickCounts(db: Tx, sinceDays = 30) {
  return db
    .select({ partnerId: affiliateClicks.partnerId, n: sql<number>`count(*)::int` })
    .from(affiliateClicks)
    .where(sql`${affiliateClicks.createdAt} > now() - make_interval(days => ${sinceDays})`)
    .groupBy(affiliateClicks.partnerId);
}
