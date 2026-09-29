import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { voteRequestAction } from "@/app/actions/requests";
import { ActionForm } from "@/components/action-form";
import { RequestForm } from "@/components/request-form";
import { Card, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { domains, fields, requestVotes } from "@/db/schema";
import { listRequests, promoteThreshold } from "@/lib/services/requests";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Course requests" };

export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const sp = await searchParams;
  const sort = sp.sort === "new" ? "new" : "top";
  const db = getDb();
  const user = await getCurrentUser();
  const [rows, fieldRows, myVotes] = await Promise.all([
    listRequests(db, sort),
    db
      .select({ id: fields.id, name: fields.name, domain: domains.name })
      .from(fields)
      .innerJoin(domains, eq(domains.id, fields.domainId))
      .orderBy(asc(domains.name), asc(fields.name)),
    user
      ? db.select({ id: requestVotes.requestId }).from(requestVotes).where(eq(requestVotes.userId, user.id))
      : Promise.resolve([]),
  ]);
  const voted = new Set(myVotes.map((v) => v.id));
  const goal = promoteThreshold();

  return (
    <main className="flex flex-col gap-5">
      <PageTitle sub={`Requests with ${goal} votes become draft courses. The requester and top voters become its founding editors.`}>
        Course requests
      </PageTitle>
      <div className="flex gap-5" role="tablist">
        <Link href="/requests?sort=top" className="umi-nav-link" aria-current={sort === "top" ? "page" : undefined} role="tab" aria-selected={sort === "top"}>
          Top
        </Link>
        <Link href="/requests?sort=new" className="umi-nav-link" aria-current={sort === "new" ? "page" : undefined} role="tab" aria-selected={sort === "new"}>
          New
        </Link>
      </div>
      <ul className="flex flex-col gap-3" data-testid="request-list">
        {rows.length === 0 && <p className="text-sm text-umi-muted">No open requests yet.</p>}
        {rows.map((r) => (
          <li key={r.id}>
            <Card className="flex gap-4">
              <div className="flex w-16 shrink-0 flex-col items-center gap-1">
                <span className="umi-badge text-sm" data-testid="vote-count">
                  {r.voteCount}
                </span>
                <span className="text-xs text-umi-muted">of {goal}</span>
              </div>
              <div className="flex-1">
                <Link href={`/requests/${r.id}`} className="font-medium text-umi-teal">
                  {r.title}
                </Link>
                <p className="text-xs text-umi-muted">
                  {r.fieldName} · by @{r.requesterHandle} · {r.createdAt.toISOString().slice(0, 10)}
                </p>
                <p className="mt-1 line-clamp-2 text-sm">{r.description}</p>
              </div>
              {user && (
                <ActionForm action={voteRequestAction} submitLabel={voted.has(r.id) ? "Voted ✓" : "Upvote"}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <input type="hidden" name="on" value={voted.has(r.id) ? "0" : "1"} />
                </ActionForm>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Request a course</h2>
        {user ? (
          <RequestForm fields={fieldRows} />
        ) : (
          <p className="text-sm">
            <Link href="/auth/sign-in" className="text-umi-teal underline">
              Sign in
            </Link>{" "}
            to request a course or vote.
          </p>
        )}
      </Card>
      <p className="text-xs text-umi-muted">
        <Pill>limits</Pill> 10 requests and 100 votes per day.
      </p>
    </main>
  );
}
