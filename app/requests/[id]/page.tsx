import Link from "next/link";
import { notFound } from "next/navigation";
import { moderateRequestAction, voteRequestAction } from "@/app/actions/requests";
import { ActionForm } from "@/components/action-form";
import { Card, Field, inputCls, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { isSiteStaff } from "@/lib/services/permissions";
import { getRequestDetail, promoteThreshold } from "@/lib/services/requests";
import { getCurrentUser } from "@/lib/session";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function RequestDetailPage({ params }: PageProps<"/requests/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  const d = await getRequestDetail(getDb(), id, user?.id);
  if (!d) notFound();
  const r = d.request;
  const open = r.status === "open";
  return (
    <main className="flex flex-col gap-4">
      <PageTitle sub={`${d.fieldName} · requested by @${d.requesterHandle} on ${r.createdAt.toISOString().slice(0, 10)}`}>
        {r.title}
      </PageTitle>
      <div className="flex items-center gap-3">
        <Pill tone={open ? "accent" : "neutral"}>{r.status}</Pill>
        <span className="text-sm" data-testid="vote-count">
          <strong>{r.voteCount}</strong> of {promoteThreshold()} votes
        </span>
        {user && open && (
          <ActionForm
            action={voteRequestAction}
            submitLabel={d.voted ? (r.requesterId === user.id ? "Your request" : "Remove vote") : "Upvote"}
          >
            <input type="hidden" name="requestId" value={r.id} />
            <input type="hidden" name="on" value={d.voted ? "0" : "1"} />
          </ActionForm>
        )}
      </div>
      <Card>
        <p className="whitespace-pre-line text-sm">{r.description}</p>
      </Card>
      {d.course && (
        <Card>
          <p className="text-sm">
            This request became the course{" "}
            <Link href={`/c/${d.course.slug}`} className="text-accent underline">
              {d.course.title}
            </Link>
            .
          </p>
        </Card>
      )}
      {d.mergedInto && (
        <Card>
          <p className="text-sm">
            Merged into{" "}
            <Link href={`/requests/${d.mergedInto.id}`} className="text-accent underline">
              {d.mergedInto.title}
            </Link>
            .
          </p>
        </Card>
      )}
      {d.similar.length > 0 && (
        <section>
          <h2 className="mb-1 font-semibold">Similar</h2>
          <ul className="ml-4 list-disc text-sm">
            {d.similar.map((s) => (
              <li key={`${s.kind}-${s.id}`}>
                <Link href={s.href} className="text-accent underline">
                  {s.title}
                </Link>{" "}
                <span className="text-xs text-muted">({s.kind})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {d.mergedFrom.length > 0 && (
        <p className="text-sm text-muted">Merged from: {d.mergedFrom.map((m) => m.title).join(", ")}</p>
      )}
      {isSiteStaff(user) && open && (
        <Card>
          <h2 className="mb-2 font-semibold">Moderation</h2>
          <div className="flex flex-wrap gap-4">
            <ActionForm action={moderateRequestAction} submitLabel="Promote now">
              <input type="hidden" name="requestId" value={r.id} />
              <input type="hidden" name="op" value="promote" />
            </ActionForm>
            <ActionForm action={moderateRequestAction} submitLabel="Reject">
              <input type="hidden" name="requestId" value={r.id} />
              <input type="hidden" name="op" value="reject" />
            </ActionForm>
          </div>
          <div className="mt-3">
            <ActionForm action={moderateRequestAction} submitLabel="Merge into">
              <input type="hidden" name="requestId" value={r.id} />
              <input type="hidden" name="op" value="merge" />
              <Field label="Target request id or URL">
                <input name="targetId" required className={inputCls} />
              </Field>
            </ActionForm>
          </div>
        </Card>
      )}
    </main>
  );
}
