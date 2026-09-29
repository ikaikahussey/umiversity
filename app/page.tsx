import Link from "next/link";
import { reviewCardAction } from "@/app/actions/engagement";
import { ActionForm } from "@/components/action-form";
import { GoalBar, StreakBadge } from "@/components/engagement";
import { Card, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { followedCourses, getStreak, suggestCourse, todaysCards, weeklyProgress } from "@/lib/services/engagement";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main>
        <PageTitle sub="Request courses, vote them into existence, build them together, and learn across many fields.">
          Become a polymath
        </PageTitle>
        <Card>
          <p className="text-sm">
            Start with <Link className="text-accent underline" href="/c/olelo-hawaii">ʻŌlelo Hawaiʻi</Link> or{" "}
            <Link className="text-accent underline" href="/c/moolelo-hawaii">Moʻolelo Hawaiʻi</Link>, browse{" "}
            <Link className="text-accent underline" href="/courses">all courses</Link>, or{" "}
            <Link className="text-accent underline" href="/requests">request one</Link>.{" "}
            <Link className="text-accent underline" href="/auth/sign-in">Sign in</Link> to track progress.
          </p>
        </Card>
      </main>
    );
  }
  const db = getDb();
  const [cards, streak, goal, suggestion, followed] = await Promise.all([
    todaysCards(db, user),
    getStreak(db, user.id),
    weeklyProgress(db, user),
    suggestCourse(db, user.id),
    followedCourses(db, user.id),
  ]);
  return (
    <main className="flex flex-col gap-5">
      <PageTitle>Aloha, {user.name}</PageTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <StreakBadge current={streak.current} longest={streak.longest} freezesLeft={streak.freezesLeft} />
        <GoalBar value={goal.value} target={goal.target} type={goal.type} percent={goal.percent} />
      </div>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Today’s cards</h2>
        {cards.length === 0 && (
          <p className="text-sm text-muted">
            {followed.length === 0 ? "Follow a course to get a daily card." : "No cards scheduled today."}
          </p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="daily-cards">
          {cards.map(({ card, courseTitle, courseSlug, reviewed }) => (
            <li key={card.id}>
              <Card>
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <Pill tone="accent">{card.kind}</Pill>
                  <Link href={`/c/${courseSlug}`} className="text-muted">
                    {courseTitle}
                  </Link>
                </div>
                <p className="text-lg font-medium">{card.body}</p>
                {card.answer && (
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer text-accent">Show answer</summary>
                    {card.answer}
                  </details>
                )}
                <div className="mt-2">
                  {reviewed ? (
                    <Pill tone="accent">Reviewed</Pill>
                  ) : (
                    <ActionForm action={reviewCardAction} submitLabel="Mark reviewed">
                      <input type="hidden" name="cardId" value={card.id} />
                    </ActionForm>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
      {suggestion && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Try a new field</h2>
          <Card>
            <Link href={`/c/${suggestion.slug}`} className="font-medium text-accent" data-testid="suggestion">
              {suggestion.title}
            </Link>
            <span className="ml-2 text-xs text-muted">{suggestion.field}</span>
            <p className="mt-1 text-sm">{suggestion.summary}</p>
          </Card>
        </section>
      )}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Following</h2>
        {followed.length === 0 ? (
          <p className="text-sm text-muted">
            You are not following any courses. <Link href="/courses" className="text-accent underline">Browse courses</Link>.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {followed.map((c) => (
              <li key={c.id}>
                <Link href={`/c/${c.slug}`} className="rounded border border-line bg-card px-2 py-1 text-accent">
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
