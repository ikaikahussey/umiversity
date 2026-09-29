import Link from "next/link";
import { notFound } from "next/navigation";
import { endorseBadgeAction, reviewBadgeAction } from "@/app/actions/badges";
import { ActionForm } from "@/components/action-form";
import { Card, Notice, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { ENDORSEMENTS_REQUIRED, endorsementCount, getBadgeForReview } from "@/lib/services/badges";
import { getCurrentUser } from "@/lib/session";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function BadgePage({ params, searchParams }: PageProps<"/badges/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = getDb();
  const row = await getBadgeForReview(db, id);
  if (!row || row.badge.type !== "community") notFound();
  const user = await getCurrentUser();
  const count = await endorsementCount(db, id);
  const pending = row.badge.status === "pending";
  return (
    <main className="flex flex-col gap-4">
      <Notice text={(await searchParams).notice} />
      <PageTitle sub={<>Community-recognized badge claimed by <Link href={`/u/${row.handle}`} className="text-accent">@{row.handle}</Link> in {row.fieldName}</>}>
        {row.badge.label}
      </PageTitle>
      <Card>
        <p className="text-sm whitespace-pre-line">{row.badge.details || "No details provided."}</p>
        <p className="mt-2 text-sm">
          <Pill tone={pending ? "warn" : "accent"}>{row.badge.status}</Pill>{" "}
          <span data-testid="endorsements">
            {count} of {ENDORSEMENTS_REQUIRED} endorsements
          </span>
        </p>
      </Card>
      {user && pending && user.id !== row.badge.userId && (
        <div className="flex flex-wrap gap-4">
          <ActionForm action={endorseBadgeAction} submitLabel="Endorse">
            <input type="hidden" name="badgeId" value={id} />
          </ActionForm>
          {(["verify", "reject"] as const).map((d) => (
            <ActionForm key={d} action={reviewBadgeAction} submitLabel={d === "verify" ? "Approve (Steward)" : "Decline (Steward)"}>
              <input type="hidden" name="badgeId" value={id} />
              <input type="hidden" name="decision" value={d} />
              <input type="hidden" name="returnTo" value={`/badges/${id}`} />
            </ActionForm>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">
        Endorsements come from verified badge holders in {row.fieldName}. A Steward of a course in the field, or a moderator,
        approves once there are {ENDORSEMENTS_REQUIRED}.
      </p>
    </main>
  );
}
