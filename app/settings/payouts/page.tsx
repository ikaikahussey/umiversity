import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { startOnboardingAction } from "@/app/actions/payouts";
import { ActionForm } from "@/components/action-form";
import { Card, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { payoutAccounts } from "@/db/schema";
import { isNewAccount, syncOnboarding, userPayouts } from "@/lib/services/payouts";
import { POINTS, pointsSummary, recentPointEvents } from "@/lib/services/points";
import { getCurrentUser } from "@/lib/session";
import { stripeClient } from "@/lib/stripe";

export const metadata = { title: "Payouts" };

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default async function PayoutSettingsPage({ searchParams }: PageProps<"/settings/payouts">) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  const db = getDb();
  const sp = await searchParams;
  if (sp.return && process.env.STRIPE_SECRET_KEY) await syncOnboarding(db, user.id, stripeClient()).catch(() => null);
  const [summary, events, history, account] = await Promise.all([
    pointsSummary(db, user.id),
    recentPointEvents(db, user.id),
    userPayouts(db, user.id),
    db.query.payoutAccounts.findFirst({ where: eq(payoutAccounts.userId, user.id) }),
  ]);
  const newAccount = isNewAccount(user.createdAt);
  return (
    <main className="flex flex-col gap-5">
      <PageTitle sub="Half of the net affiliate revenue we receive from partners that allow sharing is split each month by achievement points.">
        Points and payouts
      </PageTitle>
      <div className="grid gap-3 sm:grid-cols-3" data-testid="points-summary">
        <Card>
          <p className="text-xs uppercase text-umi-muted">Held (30 days)</p>
          <p className="text-2xl font-bold">{summary.held}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-umi-muted">Cleared</p>
          <p className="text-2xl font-bold">{summary.cleared}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-umi-muted">Clawed back</p>
          <p className="text-2xl font-bold">{summary.clawedBack}</p>
        </Card>
      </div>
      {user.pointsFrozen && <p className="text-sm text-red-700">Your points are frozen pending review.</p>}
      {newAccount && <p className="text-sm text-umi-muted">New accounts start earning payout-eligible points after 30 days.</p>}
      <Card>
        <h2 className="mb-2 font-semibold">Stripe payouts</h2>
        {account?.onboardingStatus === "complete" ? (
          <p className="text-sm">
            <Pill tone="accent">Ready</Pill> Stripe onboarding is complete.
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm">
              Complete Stripe identity and tax onboarding before your first payout. Shares under $10 roll over to the next month; each
              person can receive at most 5% of a month’s pool.
            </p>
            <ActionForm action={startOnboardingAction} submitLabel={account ? "Continue Stripe onboarding" : "Set up payouts"}>
              <span />
            </ActionForm>
          </>
        )}
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Payout history</h2>
        {history.length === 0 && <p className="text-sm text-umi-muted">No payouts yet.</p>}
        <ul className="flex flex-col gap-1 text-sm">
          {history.map(({ payout, month }) => (
            <li key={payout.id}>
              {month}: {money(payout.amountCents)} for {payout.points} points <Pill>{payout.status.replace("_", " ")}</Pill>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Recent points</h2>
        <ul className="flex flex-col gap-1 text-sm" data-testid="point-events">
          {events.length === 0 && <li className="text-umi-muted">None yet.</li>}
          {events.map((e) => (
            <li key={e.id}>
              +{e.points} {e.type.replace(/_/g, " ")} <Pill tone={e.status === "cleared" ? "accent" : e.status === "held" ? "warn" : "neutral"}>{e.status.replace("_", " ")}</Pill>{" "}
              <span className="text-xs text-umi-muted">{e.createdAt.toISOString().slice(0, 10)}</span>
            </li>
          ))}
        </ul>
        <details className="mt-3 text-xs text-umi-muted">
          <summary className="cursor-pointer">How points are earned</summary>
          <ul className="mt-1">
            {Object.entries(POINTS).map(([k, v]) => (
              <li key={k}>
                {k.replace(/_/g, " ")}: {v}
              </li>
            ))}
          </ul>
        </details>
      </Card>
    </main>
  );
}
