import Link from "next/link";
import { notFound } from "next/navigation";
import { BreadthMap, StreakBadge } from "@/components/engagement";
import { Card, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { listUserBadges } from "@/lib/services/badges";
import { POLYMATH_LABELS, breadthMap, getStreak } from "@/lib/services/engagement";
import { getUserByHandle } from "@/lib/services/users";

export async function generateMetadata({ params }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  return { title: `@${handle}` };
}

export default async function ProfilePage({ params }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  const db = getDb();
  const profile = await getUserByHandle(db, decodeURIComponent(handle));
  if (!profile) notFound();
  const [map, streak, badgeRows] = await Promise.all([
    breadthMap(db, profile.id),
    getStreak(db, profile.id),
    listUserBadges(db, profile.id, true),
  ]);
  const earned = badgeRows.filter((b) => ["learner", "polymath"].includes(b.badge.type));
  const credentials = badgeRows.filter((b) => !["learner", "polymath"].includes(b.badge.type));
  return (
    <main className="flex flex-col gap-4">
      <PageTitle variant="title" sub={`@${profile.handle} · joined ${profile.createdAt.toISOString().slice(0, 10)}`}>{profile.name}</PageTitle>
      {profile.bio && (
        <Card>
          <p className="text-sm">{profile.bio}</p>
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <StreakBadge current={streak.current} longest={streak.longest} freezesLeft={streak.freezesLeft} />
        <Card>
          <p className="text-xs uppercase tracking-wide text-umi-muted">Polymath level</p>
          <p className="text-2xl font-bold" data-testid="polymath-level">
            {map.level === 0 ? "—" : POLYMATH_LABELS[map.level as 1 | 2 | 3]}
          </p>
          <p className="text-xs text-umi-muted">
            Active in {map.activeFields} field{map.activeFields === 1 ? "" : "s"} across {map.activeDomains} domain
            {map.activeDomains === 1 ? "" : "s"}
          </p>
        </Card>
      </div>
      <Card>
        <h2 className="mb-2 font-semibold">Breadth map</h2>
        <BreadthMap domains={map.domains} />
      </Card>
      {credentials.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Credentials and recognition</h2>
          <ul className="flex flex-wrap gap-2" data-testid="credentials">
            {credentials.map(({ badge, fieldName }) => (
              <li key={badge.id}>
                <Pill tone="accent" text>{badge.label}</Pill>
                {fieldName && <span className="ml-1 text-xs text-umi-muted">{fieldName}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {earned.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Learning badges</h2>
          <ul className="flex flex-wrap gap-2" data-testid="learning-badges">
            {earned.map(({ badge }) => (
              <li key={badge.id}>
                <Pill text>{badge.label}</Pill>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-umi-muted">
        <Link href="/settings/badges" className="text-umi-teal">
          Add a credential
        </Link>
      </p>
    </main>
  );
}
