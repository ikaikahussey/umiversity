import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  assignRoleAction,
  createLessonAction,
  createUnitAction,
  reviewRevisionAction,
  updateOverviewAction,
} from "@/app/actions/courses";
import { reviewResourceAction } from "@/app/actions/discussion";
import { scheduleCardAction } from "@/app/actions/engagement";
import { ActionForm } from "@/components/action-form";
import { DiffView } from "@/components/diff-view";
import { Card, Field, inputCls, Notice, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { getCourseBySlug, getCourseOutline, listPendingRevisions } from "@/lib/services/courses";
import { capabilitiesFor, courseLevel } from "@/lib/services/permissions";
import { listPendingResources } from "@/lib/services/resources";
import { cardQueue } from "@/lib/services/engagement";
import { localDate } from "@/lib/dates";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Edit course" };

export default async function CourseEditPage({ params, searchParams }: PageProps<"/c/[course]/edit">) {
  const { course: slug } = await params;
  const db = getDb();
  const course = await getCourseBySlug(db, slug);
  if (!course) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  const caps = capabilitiesFor(await courseLevel(db, user, course.id));
  if (!caps.canProposeEdits) {
    return (
      <main>
        <PageTitle>{course.title}</PageTitle>
        <Card>
          <p className="text-sm">
            Editing opens to Contributors. You become a Contributor automatically after 5 accepted answers or edits in
            this course, or when a Steward adds you.
          </p>
        </Card>
      </main>
    );
  }
  const [pending, outline, pendingResources] = await Promise.all([
    listPendingRevisions(db, course.id),
    getCourseOutline(db, course.id),
    caps.canApprove ? listPendingResources(db, course.id) : Promise.resolve([]),
  ]);
  const today = localDate(new Date(), user.timezone);
  const queue = caps.canApprove ? await cardQueue(db, course.id, today) : [];
  const hidden = (
    <>
      <input type="hidden" name="courseId" value={course.id} />
      <input type="hidden" name="courseSlug" value={course.slug} />
    </>
  );

  return (
    <main className="flex flex-col gap-5">
      <Notice text={(await searchParams).notice} />
      <PageTitle sub={<Link href={`/c/${course.slug}`} className="text-accent">Back to course</Link>}>
        Edit: {course.title}
      </PageTitle>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Proposed edits ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-muted">Nothing waiting for review.</p>}
        <ul className="flex flex-col gap-3" data-testid="pending-revisions">
          {pending.map((p) => (
            <li key={p.revision.id}>
              <Card>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <Link href={`/c/${course.slug}/${p.unitSlug}/${p.lessonSlug}`} className="font-medium text-accent">
                    {p.lessonTitle}
                  </Link>
                  <span className="text-muted">by @{p.authorHandle}</span>
                  {p.revision.summary && <span className="italic">“{p.revision.summary}”</span>}
                </div>
                {p.revision.title !== p.lessonTitle && (
                  <p className="mb-1 text-sm">
                    Title: <s>{p.lessonTitle}</s> → {p.revision.title}
                  </p>
                )}
                <DiffView before={p.lessonBody} after={p.revision.bodyMd} />
                {caps.canApprove && (
                  <div className="mt-2 flex gap-3">
                    {(["approve", "reject"] as const).map((d) => (
                      <ActionForm key={d} action={reviewRevisionAction} submitLabel={d === "approve" ? "Approve" : "Reject"}>
                        <input type="hidden" name="revisionId" value={p.revision.id} />
                        <input type="hidden" name="decision" value={d} />
                        <input type="hidden" name="courseSlug" value={course.slug} />
                      </ActionForm>
                    ))}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {caps.canApprove && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Pending resources ({pendingResources.length})</h2>
          {pendingResources.length === 0 && <p className="text-sm text-muted">No links waiting.</p>}
          <ul className="flex flex-col gap-2" data-testid="pending-resources">
            {pendingResources.map(({ resource: r, addedByHandle }) => (
              <li key={r.id}>
                <Card className="flex flex-wrap items-center gap-3 text-sm">
                  <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="flex-1 text-accent underline">
                    {r.title}
                  </a>
                  <Pill>{r.type}</Pill>
                  <Pill tone={r.source === "youtube_job" ? "warn" : "neutral"}>
                    {r.source === "youtube_job" ? "YouTube suggestion" : `@${addedByHandle}`}
                  </Pill>
                  {(["approve", "reject"] as const).map((d) => (
                    <ActionForm key={d} action={reviewResourceAction} submitLabel={d === "approve" ? "Approve link" : "Remove link"}>
                      <input type="hidden" name="resourceId" value={r.id} />
                      <input type="hidden" name="decision" value={d} />
                      <input type="hidden" name="courseSlug" value={course.slug} />
                      <input type="hidden" name="returnTo" value={`/c/${course.slug}`} />
                    </ActionForm>
                  ))}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Lessons</h2>
        <Card>
          <ul className="flex flex-col gap-1 text-sm">
            {outline.map((u) => (
              <li key={u.id}>
                <span className="font-medium">
                  {u.position}. {u.title}
                </span>
                <ul className="ml-4">
                  {u.lessons.map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <Link href={`/c/${course.slug}/edit/${l.id}`} className="text-accent underline">
                        {l.title}
                      </Link>
                      {!l.hasBody && <Pill tone="warn">empty</Pill>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {caps.canApprove && (
        <section className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="mb-2 font-semibold">Add unit</h3>
            <ActionForm action={createUnitAction} submitLabel="Add unit" resetOnSuccess>
              {hidden}
              <Field label="Title">
                <input name="title" required className={inputCls} />
              </Field>
              <Field label="Summary">
                <input name="summary" className={inputCls} />
              </Field>
            </ActionForm>
          </Card>
          <Card>
            <h3 className="mb-2 font-semibold">Add lesson</h3>
            {outline.length === 0 ? (
              <p className="text-sm text-muted">Add a unit first.</p>
            ) : (
              <ActionForm action={createLessonAction} submitLabel="Add lesson" resetOnSuccess>
                {hidden}
                <Field label="Unit">
                  <select name="unitId" className={inputCls}>
                    {outline.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.position}. {u.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Title">
                  <input name="title" required className={inputCls} />
                </Field>
                <Field label="Minutes">
                  <input name="minutes" type="number" min={1} max={240} defaultValue={10} className={inputCls} />
                </Field>
              </ActionForm>
            )}
          </Card>
          <Card className="md:col-span-2">
            <h3 className="mb-2 font-semibold">Overview</h3>
            <ActionForm action={updateOverviewAction} submitLabel="Save overview">
              {hidden}
              <Field label="Summary (one line)">
                <input name="summary" defaultValue={course.summary} className={inputCls} />
              </Field>
              <Field label="Keywords" hint="Used for search and nightly YouTube suggestions">
                <input name="keywords" defaultValue={course.keywords} className={inputCls} />
              </Field>
              <Field label="Overview (Markdown)">
                <textarea name="overviewMd" rows={6} defaultValue={course.overviewMd} className={inputCls} />
              </Field>
            </ActionForm>
          </Card>
        </section>
      )}

      {caps.canApprove && (
        <section>
          <Card>
            <h3 className="mb-2 font-semibold">Daily card queue</h3>
            <ul className="mb-3 flex flex-col gap-1 text-sm" data-testid="card-queue">
              {queue.length === 0 && <li className="text-muted">No cards scheduled from today on.</li>}
              {queue.map((c) => (
                <li key={c.id}>
                  <span className="font-mono text-xs">{c.scheduledFor}</span> <Pill>{c.kind}</Pill> {c.body}
                  {c.answer && <span className="text-muted"> — {c.answer}</span>}
                </li>
              ))}
            </ul>
            <ActionForm action={scheduleCardAction} submitLabel="Schedule card" resetOnSuccess>
              {hidden}
              <input type="hidden" name="returnTo" value={`/c/${course.slug}/edit`} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">
                  <input name="scheduledFor" type="date" required defaultValue={today} className={inputCls} />
                </Field>
                <Field label="Kind">
                  <select name="kind" className={inputCls}>
                    <option value="word">Word</option>
                    <option value="fact">Fact</option>
                    <option value="question">Question</option>
                  </select>
                </Field>
              </div>
              <Field label="Card text">
                <input name="body" required maxLength={500} className={inputCls} />
              </Field>
              <Field label="Answer or meaning (optional)">
                <input name="answer" className={inputCls} />
              </Field>
            </ActionForm>
          </Card>
        </section>
      )}

      {caps.canSteward && (
        <section>
          <Card>
            <h3 className="mb-2 font-semibold">Roles</h3>
            <ActionForm action={assignRoleAction} submitLabel="Update role">
              {hidden}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Handle">
                  <input name="handle" required placeholder="@handle" className={inputCls} />
                </Field>
                <Field label="Role">
                  <select name="role" className={inputCls}>
                    <option value="contributor">Contributor</option>
                    <option value="editor">Editor</option>
                    <option value="steward">Steward</option>
                    <option value="none">Remove role</option>
                  </select>
                </Field>
              </div>
            </ActionForm>
          </Card>
        </section>
      )}
    </main>
  );
}
