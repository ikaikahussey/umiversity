import Link from "next/link";
import { notFound } from "next/navigation";
import { followAction } from "@/app/actions/engagement";
import { ActionForm } from "@/components/action-form";
import { AddResourceForm, NewThreadForm, ResourceList, ThreadList } from "@/components/discussion";
import { Markdown } from "@/components/markdown";
import { Card, Notice, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { getCourseBySlug, getCourseOutline, listCourseRoles } from "@/lib/services/courses";
import { listThreads } from "@/lib/services/discussion";
import { completedLessonIds, courseProgress, followerCount, isFollowing } from "@/lib/services/engagement";
import { listResources } from "@/lib/services/resources";
import { capabilitiesFor, courseLevel } from "@/lib/services/permissions";
import { getCurrentUser } from "@/lib/session";

export async function generateMetadata({ params }: PageProps<"/c/[course]">) {
  const { course } = await params;
  const c = await getCourseBySlug(getDb(), course);
  return { title: c?.title ?? "Course" };
}

export default async function CoursePage({ params, searchParams }: PageProps<"/c/[course]">) {
  const { course: slug } = await params;
  const db = getDb();
  const course = await getCourseBySlug(db, slug);
  if (!course) notFound();
  const user = await getCurrentUser();
  const caps = capabilitiesFor(await courseLevel(db, user, course.id));
  const [outline, roles, topThreads, courseResources] = await Promise.all([
    getCourseOutline(db, course.id),
    listCourseRoles(db, course.id),
    listThreads(db, { courseId: course.id }, 10),
    listResources(db, { courseId: course.id }, user?.id),
  ]);
  const here = `/c/${course.slug}`;
  const [followers, following, prog, doneIds] = await Promise.all([
    followerCount(db, course.id),
    user ? isFollowing(db, user.id, course.id) : Promise.resolve(false),
    user ? courseProgress(db, user.id, course.id) : Promise.resolve(null),
    user ? completedLessonIds(db, user.id, course.id) : Promise.resolve(new Set<string>()),
  ]);
  const scopeProps = { courseId: course.id, courseSlug: course.slug, returnTo: here };

  return (
    <main className="flex flex-col gap-5">
      <Notice text={(await searchParams).notice} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle variant="title" sub={course.summary}>{course.title}</PageTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={course.status === "open" ? "accent" : "warn"}>{course.status}</Pill>
          <span className="text-xs text-umi-muted" data-testid="followers">
            {followers} {followers === 1 ? "follower" : "followers"}
          </span>
          {user && (
            <ActionForm action={followAction} submitLabel={following ? "Unfollow" : "Follow"}>
              <input type="hidden" name="courseId" value={course.id} />
              <input type="hidden" name="on" value={following ? "0" : "1"} />
              <input type="hidden" name="returnTo" value={`/c/${course.slug}`} />
            </ActionForm>
          )}
          {(caps.canProposeEdits || caps.canApprove) && (
            <Link href={`/c/${course.slug}/edit`} className="umi-btn-secondary">
              Edit course
            </Link>
          )}
        </div>
      </div>
      {prog && prog.total > 0 && (
        <p className="text-sm text-umi-muted" data-testid="course-progress">
          Your progress: {prog.done} of {prog.total} lessons
        </p>
      )}
      {course.overviewMd && (
        <Card>
          <Markdown source={course.overviewMd} />
        </Card>
      )}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Units</h2>
        {outline.length === 0 && <p className="text-sm text-umi-muted">No units yet. Editors can add the first unit.</p>}
        <ol className="flex flex-col gap-3" data-testid="outline">
          {outline.map((u) => (
            <li key={u.id}>
              <Card>
                <h3 className="font-semibold">
                  {u.position}. {u.title}
                </h3>
                {u.summary && <p className="text-sm text-umi-muted">{u.summary}</p>}
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {u.lessons.map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <Link href={`/c/${course.slug}/${u.slug}/${l.slug}`} className="text-umi-teal underline">
                        {l.title}
                      </Link>
                      <span className="text-xs text-umi-muted">{l.minutes} min</span>
                      {doneIds.has(l.id) && <span className="text-xs text-umi-teal">✓</span>}
                      {!l.hasBody && <Pill tone="warn">needs content</Pill>}
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ol>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Top questions</h2>
        <ThreadList courseSlug={course.slug} threads={topThreads} />
        {user && <NewThreadForm {...scopeProps} />}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Resources</h2>
        <ResourceList rows={courseResources.slice(0, 15)} returnTo={here} viewerId={user?.id} />
        {user && <AddResourceForm {...scopeProps} />}
      </section>
      {roles.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Course team</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {roles.map((r) => (
              <li key={r.userId}>
                <Link href={`/u/${r.handle}`} className="text-umi-teal">
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
