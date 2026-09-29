import Link from "next/link";
import { notFound } from "next/navigation";
import { completeLessonAction } from "@/app/actions/engagement";
import { ActionForm } from "@/components/action-form";
import { AddResourceForm, NewThreadForm, ResourceList, ThreadList } from "@/components/discussion";
import { Markdown } from "@/components/markdown";
import { Card, Notice } from "@/components/ui";
import { getDb } from "@/db";
import { getCourseOutline, getLessonBySlugs } from "@/lib/services/courses";
import { listThreads } from "@/lib/services/discussion";
import { lessonCompleted } from "@/lib/services/engagement";
import { listResources } from "@/lib/services/resources";
import { capabilitiesFor, courseLevel } from "@/lib/services/permissions";
import { getCurrentUser } from "@/lib/session";

type Props = PageProps<"/c/[course]/[unit]/[lesson]">;

export async function generateMetadata({ params }: Props) {
  const { course, unit, lesson } = await params;
  const row = await getLessonBySlugs(getDb(), course, unit, lesson);
  return { title: row ? `${row.lesson.title} · ${row.course.title}` : "Lesson" };
}

function youtubeEmbed(url: string): string | null {
  const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/.exec(url);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

export default async function LessonPage({ params, searchParams }: Props) {
  const { course: cs, unit: us, lesson: ls } = await params;
  const db = getDb();
  const row = await getLessonBySlugs(db, cs, us, ls);
  if (!row) notFound();
  const { course, unit, lesson } = row;
  const user = await getCurrentUser();
  const caps = capabilitiesFor(await courseLevel(db, user, course.id));
  const outline = await getCourseOutline(db, course.id);
  const flat = outline.flatMap((u) => u.lessons.map((l) => ({ ...l, unitSlug: u.slug })));
  const idx = flat.findIndex((l) => l.id === lesson.id);
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;
  const embed = lesson.videoUrl ? youtubeEmbed(lesson.videoUrl) : null;
  const scope = { courseId: course.id, lessonId: lesson.id };
  const [threadRows, resourceRows, done] = await Promise.all([
    listThreads(db, scope),
    listResources(db, scope, user?.id),
    user ? lessonCompleted(db, user.id, lesson.id) : Promise.resolve(false),
  ]);
  const here = `/c/${course.slug}/${unit.slug}/${lesson.slug}`;
  const scopeProps = { courseId: course.id, courseSlug: course.slug, unitId: unit.id, lessonId: lesson.id, returnTo: here };

  return (
    <main className="flex flex-col gap-4">
      <Notice text={(await searchParams).notice} />
      <nav className="text-sm text-muted">
        <Link href={`/c/${course.slug}`} className="text-accent">
          {course.title}
        </Link>{" "}
        › {unit.title}
      </nav>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">{lesson.title}</h1>
        {caps.canProposeEdits && (
          <Link href={`/c/${course.slug}/edit/${lesson.id}`} className="rounded border border-line px-2 py-1 text-sm">
            Propose edit
          </Link>
        )}
      </div>
      {embed && (
        <iframe
          className="aspect-video w-full rounded"
          src={embed}
          title={lesson.title}
          allow="accelerometer; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      )}
      {lesson.audioUrl && <audio controls src={lesson.audioUrl} className="w-full" />}
      <Card>
        {lesson.bodyMd ? (
          <Markdown source={lesson.bodyMd} />
        ) : (
          <p className="text-sm text-muted">This lesson has no content yet.</p>
        )}
      </Card>
      {user && (
        <div data-testid="completion">
          {done ? (
            <p className="text-sm text-accent">✓ Completed</p>
          ) : (
            <ActionForm action={completeLessonAction} submitLabel="Mark lesson complete">
              <input type="hidden" name="lessonId" value={lesson.id} />
              <input type="hidden" name="returnTo" value={here} />
            </ActionForm>
          )}
        </div>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Resources</h2>
        <ResourceList rows={resourceRows} returnTo={here} viewerId={user?.id} />
        {user && <AddResourceForm {...scopeProps} />}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Questions</h2>
        <ThreadList courseSlug={course.slug} threads={threadRows} />
        {user && <NewThreadForm {...scopeProps} />}
      </section>
      <nav className="flex justify-between text-sm">
        {prev ? (
          <Link href={`/c/${course.slug}/${prev.unitSlug}/${prev.slug}`} className="text-accent">
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/c/${course.slug}/${next.unitSlug}/${next.slug}`} className="text-accent">
            {next.title} →
          </Link>
        )}
      </nav>
    </main>
  );
}
