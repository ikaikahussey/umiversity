import Link from "next/link";
import { notFound } from "next/navigation";
import { acceptAnswerAction, createPostAction } from "@/app/actions/discussion";
import { ActionForm } from "@/components/action-form";
import { Markdown } from "@/components/markdown";
import { Card, Field, inputCls, Pill } from "@/components/ui";
import { VoteControl } from "@/components/vote-control";
import { getDb } from "@/db";
import { getCourseBySlug } from "@/lib/services/courses";
import { getThread } from "@/lib/services/discussion";
import { LEVEL, courseLevel } from "@/lib/services/permissions";
import { getCurrentUser } from "@/lib/session";

const UUID = /^[0-9a-f-]{36}$/i;

function Author({ handle, badges }: { handle: string; badges?: string[] }) {
  return (
    <span className="text-xs text-muted">
      <Link href={`/u/${handle}`} className="text-accent">
        @{handle}
      </Link>
      {badges?.map((b) => (
        <span key={b} className="ml-1" data-testid="author-badge">
          <Pill tone="accent">{b}</Pill>
        </span>
      ))}
    </span>
  );
}

export default async function ThreadPage({ params }: PageProps<"/c/[course]/q/[thread]">) {
  const { course: slug, thread: threadId } = await params;
  if (!UUID.test(threadId)) notFound();
  const db = getDb();
  const course = await getCourseBySlug(db, slug);
  if (!course) notFound();
  const user = await getCurrentUser();
  const view = await getThread(db, threadId, user?.id);
  if (!view || view.thread.courseId !== course.id) notFound();
  const t = view.thread;
  const canAccept = Boolean(user) && (user!.id === t.authorId || (await courseLevel(db, user, course.id)) >= LEVEL.steward);
  const here = `/c/${course.slug}/q/${t.id}`;

  return (
    <main className="flex flex-col gap-4">
      <nav className="text-sm">
        <Link href={`/c/${course.slug}`} className="text-accent">
          {course.title}
        </Link>
      </nav>
      <Card className="flex gap-3">
        <VoteControl
          targetType="thread"
          targetId={t.id}
          score={t.score}
          myVote={view.myVotes.get(t.id) ?? 0}
          returnTo={here}
          canVote={Boolean(user) && user!.id !== t.authorId}
        />
        <div className="flex-1">
          <h1 className="text-xl font-bold">{t.title}</h1>
          <Author handle={view.authorHandle} badges={view.badges.get(t.authorId)} />
          <Markdown source={t.bodyMd} className="mt-2" />
        </div>
      </Card>
      <h2 className="font-semibold">
        {view.posts.length} {view.posts.length === 1 ? "answer" : "answers"}
      </h2>
      <ul className="flex flex-col gap-3" data-testid="answers">
        {view.posts.map(({ post: p, authorHandle }) => {
          const accepted = p.id === t.acceptedPostId;
          return (
            <li key={p.id}>
              <Card className={`flex gap-3 ${accepted ? "border-accent" : ""}`}>
                <VoteControl
                  targetType="post"
                  targetId={p.id}
                  score={p.score}
                  myVote={view.myVotes.get(p.id) ?? 0}
                  returnTo={here}
                  canVote={Boolean(user) && user!.id !== p.authorId}
                />
                <div className="flex-1">
                  {accepted && <Pill tone="accent">Accepted answer</Pill>}
                  <Markdown source={p.bodyMd} />
                  <div className="mt-2 flex items-center justify-between">
                    <Author handle={authorHandle} badges={view.badges.get(p.authorId)} />
                    {canAccept && (
                      <ActionForm action={acceptAnswerAction} submitLabel={accepted ? "Unaccept" : "Accept"}>
                        <input type="hidden" name="threadId" value={t.id} />
                        {!accepted && <input type="hidden" name="postId" value={p.id} />}
                        <input type="hidden" name="returnTo" value={here} />
                      </ActionForm>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {user ? (
        <Card>
          <ActionForm action={createPostAction} submitLabel="Post answer" resetOnSuccess testId="answer-form">
            <input type="hidden" name="threadId" value={t.id} />
            <input type="hidden" name="returnTo" value={here} />
            <Field label="Your answer (Markdown)">
              <textarea name="bodyMd" required rows={4} className={inputCls} />
            </Field>
          </ActionForm>
        </Card>
      ) : (
        <p className="text-sm">
          <Link href="/auth/sign-in" className="text-accent underline">
            Sign in
          </Link>{" "}
          to answer.
        </p>
      )}
    </main>
  );
}
