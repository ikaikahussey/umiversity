import { notFound } from "next/navigation";
import { Card, PageTitle } from "@/components/ui";
import { getDb } from "@/db";
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
  return (
    <main className="flex flex-col gap-4">
      <PageTitle sub={`@${profile.handle} · joined ${profile.createdAt.toISOString().slice(0, 10)}`}>
        {profile.name}
      </PageTitle>
      {profile.bio && (
        <Card>
          <p className="text-sm">{profile.bio}</p>
        </Card>
      )}
    </main>
  );
}
