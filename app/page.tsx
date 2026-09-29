import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <main>
      <PageTitle sub="Request courses, build them together, and learn across many fields.">
        {user ? `Aloha, ${user.name}` : "Learn across fields"}
      </PageTitle>
      <Card>
        <p className="text-sm">
          Start with <Link className="text-accent underline" href="/c/olelo-hawaii">ʻŌlelo Hawaiʻi</Link> or{" "}
          <Link className="text-accent underline" href="/c/moolelo-hawaii">Moʻolelo Hawaiʻi</Link>, or{" "}
          <Link className="text-accent underline" href="/requests">request a course</Link>.
        </p>
      </Card>
    </main>
  );
}
