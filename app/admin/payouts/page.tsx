import Link from "next/link";
import { redirect } from "next/navigation";
import { computePayoutAction, freezePointsAction, recordRevenueAction, upsertPartnerAction } from "@/app/actions/payouts";
import { ActionForm } from "@/components/action-form";
import { Card, Field, inputCls, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { clickCounts, listPartners, listRevenue } from "@/lib/services/affiliates";
import { listPeriods, settleableMonth } from "@/lib/services/payouts";
import { isSiteStaff } from "@/lib/services/permissions";
import { collusionFlags } from "@/lib/services/points";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Payouts admin" };
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default async function PayoutsAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!isSiteStaff(user)) {
    return (
      <main>
        <PageTitle>Payouts admin</PageTitle>
        <p className="text-sm">Moderators and admins only.</p>
      </main>
    );
  }
  const db = getDb();
  const [partners, revenue, periods, flags, clicks] = await Promise.all([
    listPartners(db),
    listRevenue(db),
    listPeriods(db),
    collusionFlags(db),
    clickCounts(db),
  ]);
  const clickMap = new Map(clicks.map((c) => [c.partnerId, c.n]));
  return (
    <main className="flex flex-col gap-5">
      <PageTitle sub={<Link href="/admin" className="text-umi-teal">← Admin</Link>}>Payouts admin</PageTitle>

      <Card>
        <h2 className="mb-2 font-semibold">Affiliate partners</h2>
        <table className="mb-3 w-full text-sm" data-testid="partners">
          <thead className="text-left text-xs text-umi-muted">
            <tr>
              <th>Name</th>
              <th>Domain</th>
              <th>Network</th>
              <th>Eligible</th>
              <th>Clicks (30d)</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.domain}</td>
                <td>{p.network}</td>
                <td>{p.payoutEligible ? <Pill tone="accent">yes</Pill> : <Pill>no</Pill>}</td>
                <td>{clickMap.get(p.id) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ActionForm action={upsertPartnerAction} submitLabel="Save partner">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Partner name">
              <input name="name" required className={inputCls} />
            </Field>
            <Field label="Network">
              <input name="network" required className={inputCls} placeholder="Impact, CJ, Awin…" />
            </Field>
            <Field label="Domain">
              <input name="domain" required className={inputCls} placeholder="coursera.org" />
            </Field>
            <Field label="Tracking parameter">
              <input name="trackingParam" className={inputCls} placeholder="ref=umiversity" />
            </Field>
          </div>
          <Field label="Terms review note">
            <input name="termsNote" className={inputCls} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="payoutEligible" /> Program terms permit sharing commissions with users
          </label>
        </ActionForm>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Revenue received</h2>
        <ul className="mb-3 flex flex-col gap-1 text-sm" data-testid="revenue">
          {revenue.map(({ revenue: r, partnerName, eligible }) => (
            <li key={r.id}>
              {r.month} · {partnerName} · net {money(r.netCents)} (gross {money(r.grossCents)}, reversals {money(r.reversalsCents)}){" "}
              {!eligible && <Pill>not shared</Pill>}
            </li>
          ))}
        </ul>
        {partners.length > 0 && (
          <ActionForm action={recordRevenueAction} submitLabel="Record revenue" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Partner">
                <select name="partnerId" className={inputCls}>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Month received (YYYY-MM)">
                <input name="month" required pattern="\d{4}-\d{2}" className={inputCls} />
              </Field>
              <Field label="Date received">
                <input name="receivedAt" type="date" className={inputCls} />
              </Field>
              <Field label="Gross ($)">
                <input name="gross" required inputMode="decimal" className={inputCls} />
              </Field>
              <Field label="Refunds and reversals ($)">
                <input name="reversals" inputMode="decimal" defaultValue="0" className={inputCls} />
              </Field>
            </div>
          </ActionForm>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Payout periods</h2>
        <ul className="mb-3 flex flex-col gap-1 text-sm" data-testid="periods">
          {periods.length === 0 && <li className="text-umi-muted">None yet.</li>}
          {periods.map(({ period, payees, paidCents }) => (
            <li key={period.id}>
              {period.month}: pool {money(period.poolCents)}, {period.totalPoints} points, {payees} payees, paid {money(paidCents)}{" "}
              <Pill>{period.status}</Pill>
            </li>
          ))}
        </ul>
        <ActionForm action={computePayoutAction} submitLabel="Compute month">
          <Field label="Month to compute" hint="Points earned in a month finish their 30-day hold about two months later. The monthly cron does this automatically.">
            <input name="month" defaultValue={settleableMonth()} className={inputCls} />
          </Field>
        </ActionForm>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Integrity</h2>
        <h3 className="text-sm font-medium">Mutual upvote pairs (30 days)</h3>
        <ul className="mb-3 text-sm" data-testid="collusion">
          {flags.length === 0 && <li className="text-umi-muted">No pairs flagged.</li>}
          {flags.map((f) => (
            <li key={`${f.a}-${f.b}`}>
              @{f.a} ↔ @{f.b}: {f.a_to_b} / {f.b_to_a} upvotes
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-4">
          {(["1", "0"] as const).map((v) => (
            <ActionForm key={v} action={freezePointsAction} submitLabel={v === "1" ? "Freeze points" : "Unfreeze points"}>
              <input type="hidden" name="frozen" value={v} />
              <Field label="Handle">
                <input name="handle" required className={inputCls} />
              </Field>
            </ActionForm>
          ))}
        </div>
      </Card>
    </main>
  );
}
