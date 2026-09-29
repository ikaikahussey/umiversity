import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { Card, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { getCourseBySlug, getCourseOutline, listCourseRoles } from "@/lib/services/courses";
import { capabilitiesFor, courseLevel } from "@/lib/services/permissions";
import { getCurrentUser } from "@/lib/session";

export async function generateMetadata({ params }: PageProps<"/c/[course]">) {
  const { course } = await params;
  const c = await getCourseBySlug(getDb(), course);
  return { title: c?.title ?? "Course" };
}

export default async function CoursePage({ params }: PageProps<"/c/[course]">) {
  const { course: slug } = await params;
  const db = getDb();
  const course = await getCourseBySlug(db, slug);
  if (!course) notFound();
  const user = await getCurrentUser();
  const caps = capabilitiesFor(await courseLevel(db, user, course.id));
  const [outline, roles] = await Promise.all([getCourseOutline(db, course.id), listCourseRoles(db, course.id)]);

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle sub={course.summary}>{course.title}</PageTitle>
        <div className="flex items-center gap-2">
          <Pill tone={course.status === "open" ? "accent" : "warn"}>{course.status}</Pill>
          {(caps.canProposeEdits || caps.canApprove) && (
            <Link href={`/c/${course.slug}/edit`} className="rounded border border-line px-2 py-1 text-sm">
              Edit course
            </Link>
          )}
        </div>
      </div>
      {course.overviewMd && (
        <Card>
          <Markdown source={course.overviewMd} />
        </Card>
      )}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Units</h2>
        {outline.length === 0 && <p className="text-sm text-muted">No units yet. Editors can add the first unit.</p>}
        <ol className="flex flex-col gap-3" data-testid="outline">
          {outline.map((u) => (
            <li key={u.id}>
              <Card>
                <h3 className="font-semibold">
                  {u.position}. {u.title}
                </h3>
                {u.summary && <p className="text-sm text-muted">{u.summary}</p>}
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {u.lessons.map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <Link href={`/c/${course.slug}/${u.slug}/${l.slug}`} className="text-accent underline">
                        {l.title}
                      </Link>
                      <span className="text-xs text-muted">{l.minutes} min</span>
                      {!l.hasBody && <Pill tone="warn">needs content</Pill>}
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ol>
      </section>
      {roles.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Course team</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {roles.map((r) => (
              <li key={r.userId}>
                <Link href={`/u/${r.handle}`} className="text-accent">
                  @{r.handle}
                </Link>{" "}
                <Pill>{r.role}</Pill>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
