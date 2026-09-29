import Link from "next/link";
import { redirect } from "next/navigation";
import { reviewBadgeAction } from "@/app/actions/badges";
import { ActionForm } from "@/components/action-form";
import { Card, Notice, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { ENDORSEMENTS_REQUIRED, pendingBadgeQueue } from "@/lib/services/badges";
import { isSiteStaff } from "@/lib/services/permissions";
import { listRequests } from "@/lib/services/requests";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Admin" };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!isSiteStaff(user)) {
    return (
      <main>
        <PageTitle>Admin</PageTitle>
        <p className="text-sm">Moderators and admins only.</p>
      </main>
    );
  }
  const db = getDb();
  const [queue, requests] = await Promise.all([pendingBadgeQueue(db), listRequests(db, "new", 30)]);
  return (
    <main className="flex flex-col gap-5">
      <Notice text={(await searchParams).notice} />
      <PageTitle sub={<Link href="/admin/payouts" className="text-accent">Payouts and points →</Link>}>Admin</PageTitle>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Badge review queue ({queue.length})</h2>
        {queue.length === 0 && <p className="text-sm text-muted">Nothing to review.</p>}
        <ul className="flex flex-col gap-2" data-testid="badge-queue">
          {queue.map(({ badge, fieldName, handle, endorsements }) => (
            <li key={badge.id}>
              <Card className="flex flex-col gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{badge.label}</span>
                  <Pill>{badge.type}</Pill>
                  <span className="text-muted">{fieldName}</span>
                  <Link href={`/u/${handle}`} className="text-accent">
                    @{handle}
                  </Link>
                  {badge.type === "community" && (
                    <Link href={`/badges/${badge.id}`} className="text-xs text-accent underline">
                      {endorsements}/{ENDORSEMENTS_REQUIRED} endorsements
                    </Link>
                  )}
                  {badge.evidenceBlobUrl && (
                    <a href={`/api/badges/${badge.id}/evidence`} target="_blank" rel="noreferrer" className="text-xs text-accent underline">
                      View private document
                    </a>
                  )}
                </div>
                {badge.details && <p className="whitespace-pre-line text-muted">{badge.details}</p>}
                <div className="flex gap-3">
                  {(["verify", "reject"] as const).map((d) => (
                    <ActionForm key={d} action={reviewBadgeAction} submitLabel={d === "verify" ? "Verify" : "Reject"}>
                      <input type="hidden" name="badgeId" value={badge.id} />
                      <input type="hidden" name="decision" value={d} />
                      <input type="hidden" name="returnTo" value="/admin" />
                    </ActionForm>
                  ))}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Request moderation</h2>
        <p className="mb-2 text-sm text-muted">Open a request to merge, reject, or promote it early.</p>
        <ul className="flex flex-col gap-1 text-sm">
          {requests.map((r) => (
            <li key={r.id}>
              <Link href={`/requests/${r.id}`} className="text-accent">
                {r.title}
              </Link>{" "}
              <span className="text-xs text-muted">
                {r.voteCount} votes · {r.fieldName} · @{r.requesterHandle}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
