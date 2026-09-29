import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { setBadgeDisplayAction, submitBadgeAction } from "@/app/actions/badges";
import { ActionForm } from "@/components/action-form";
import { Card, Field, inputCls, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { domains, fields } from "@/db/schema";
import { listUserBadges } from "@/lib/services/badges";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Badges" };

export default async function BadgeSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  const db = getDb();
  const [mine, fieldRows] = await Promise.all([
    listUserBadges(db, user.id, false),
    db
      .select({ id: fields.id, name: fields.name, domain: domains.name })
      .from(fields)
      .innerJoin(domains, eq(domains.id, fields.domainId))
      .orderBy(asc(domains.name), asc(fields.name)),
  ]);
  return (
    <main className="flex flex-col gap-5">
      <PageTitle sub="Only the badge label is public. Uploaded documents are private and deleted 30 days after review.">
        Badges
      </PageTitle>
      <Card>
        <h2 className="mb-2 font-semibold">Submit a credential</h2>
        <ActionForm action={submitBadgeAction} submitLabel="Submit" testId="badge-form">
          <Field label="Type">
            <select name="type" className={inputCls} defaultValue="degree">
              <option value="degree">Degree (upload diploma or transcript)</option>
              <option value="credential">Professional credential (upload license or certificate)</option>
              <option value="community">Community-recognized (endorsed by 3 badge holders, approved by a Steward)</option>
            </select>
          </Field>
          <Field label="Field">
            <select name="fieldId" required className={inputCls} defaultValue="">
              <option value="" disabled>
                Choose a field
              </option>
              {fieldRows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.domain} — {f.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Badge label" hint='As it should appear, e.g. "MA, Hawaiian Language — UH Mānoa" or "Kumu hula"'>
            <input name="label" required minLength={3} maxLength={120} className={inputCls} />
          </Field>
          <Field label="Details for reviewers" hint="Institution, year, issuer, license number, or who can vouch for you">
            <textarea name="details" rows={3} className={inputCls} />
          </Field>
          <Field label="Document (PDF, JPEG or PNG, up to 5 MB; not needed for community badges)">
            <input name="evidence" type="file" accept="application/pdf,image/jpeg,image/png" className="text-sm" />
          </Field>
        </ActionForm>
      </Card>
      <section>
        <h2 className="mb-2 font-semibold">Your badges</h2>
        {mine.length === 0 && <p className="text-sm text-muted">None yet.</p>}
        <ul className="flex flex-col gap-2" data-testid="my-badges">
          {mine.map(({ badge, fieldName }) => (
            <li key={badge.id}>
              <Card className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{badge.label}</span>
                <Pill>{badge.type}</Pill>
                {fieldName && <span className="text-xs text-muted">{fieldName}</span>}
                <Pill tone={badge.status === "verified" ? "accent" : badge.status === "pending" ? "warn" : "neutral"}>{badge.status}</Pill>
                {badge.type === "community" && badge.status === "pending" && (
                  <Link href={`/badges/${badge.id}`} className="text-xs text-accent underline">
                    Endorsement link
                  </Link>
                )}
                {badge.status === "verified" && (
                  <span className="ml-auto">
                    <ActionForm action={setBadgeDisplayAction} submitLabel={badge.display ? "Hide from profile" : "Show on profile"}>
                      <input type="hidden" name="badgeId" value={badge.id} />
                      <input type="hidden" name="display" value={badge.display ? "0" : "1"} />
                    </ActionForm>
                  </span>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
