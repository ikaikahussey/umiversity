import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { proposeRevisionAction, revertLessonAction } from "@/app/actions/courses";
import { ActionForm } from "@/components/action-form";
import { Card, Field, inputCls, Notice, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { getLessonWithCourse, listRevisions } from "@/lib/services/courses";
import { capabilitiesFor, courseLevel } from "@/lib/services/permissions";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Edit lesson" };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function LessonEditPage({ params, searchParams }: PageProps<"/c/[course]/edit/[lessonId]">) {
  const { course: slug, lessonId } = await params;
  if (!UUID.test(lessonId)) notFound();
  const db = getDb();
  const row = await getLessonWithCourse(db, lessonId).catch(() => null);
  if (!row || row.course.slug !== slug) notFound();
  const { course, unit, lesson } = row;
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  const caps = capabilitiesFor(await courseLevel(db, user, course.id));
  const history = await listRevisions(db, lesson.id);

  return (
    <main className="flex flex-col gap-5">
      <Notice text={(await searchParams).notice} />
      <PageTitle
        variant="title"
        sub={
          <Link href={`/c/${course.slug}/${unit.slug}/${lesson.slug}`} className="text-umi-teal">
            View lesson
          </Link>
        }
      >
        {lesson.title}
      </PageTitle>
      {caps.canProposeEdits ? (
        <Card>
          <ActionForm action={proposeRevisionAction} submitLabel="Propose edit" testId="propose-form">
            <input type="hidden" name="lessonId" value={lesson.id} />
            <input type="hidden" name="courseSlug" value={course.slug} />
            <Field label="Title">
              <input name="title" defaultValue={lesson.title} className={inputCls} />
            </Field>
            <Field label="Lesson text (Markdown)">
              <textarea name="bodyMd" rows={16} defaultValue={lesson.bodyMd} className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Edit summary">
              <input name="summary" placeholder="What changed and why" className={inputCls} />
            </Field>
          </ActionForm>
        </Card>
      ) : (
        <p className="text-sm text-umi-muted">Only Contributors can propose edits.</p>
      )}
      <section>
        <h2 className="mb-2 text-lg font-semibold">History</h2>
        <ul className="flex flex-col gap-2" data-testid="history">
          {history.map(({ revision: r, authorHandle }) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Pill tone={r.status === "approved" ? "accent" : r.status === "proposed" ? "warn" : "neutral"}>
                    {r.status}
                  </Pill>
                  {r.id === lesson.currentRevisionId && <Pill tone="accent">current</Pill>}
                  {r.revertOfId && <Pill>revert</Pill>}
                  <span>@{authorHandle}</span>
                  <span className="text-umi-muted">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
                  {r.summary && <span className="italic">“{r.summary}”</span>}
                </div>
                {caps.canSteward && r.status === "approved" && r.id !== lesson.currentRevisionId && (
                  <div className="mt-2">
                    <ActionForm action={revertLessonAction} submitLabel="Revert to this">
                      <input type="hidden" name="lessonId" value={lesson.id} />
                      <input type="hidden" name="revisionId" value={r.id} />
                      <input type="hidden" name="courseSlug" value={course.slug} />
                    </ActionForm>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
