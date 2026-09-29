import Link from "next/link";
import { Card, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { listCourses } from "@/lib/services/courses";

export const metadata = { title: "Courses" };

export default async function CoursesPage() {
  const rows = await listCourses(getDb());
  const byDomain = new Map<string, typeof rows>();
  for (const r of rows) byDomain.set(r.domainName, [...(byDomain.get(r.domainName) ?? []), r]);
  return (
    <main>
      <PageTitle sub={<>Missing a subject? <Link href="/requests" className="text-umi-teal underline">Request a course</Link>.</>}>
        Courses
      </PageTitle>
      {[...byDomain.entries()].map(([domain, list]) => (
        <section key={domain} className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">{domain}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map((c) => (
              <li key={c.id}>
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/c/${c.slug}`} className="umi-title text-lg text-umi-teal">
                      {c.title}
                    </Link>
                    <Pill tone={c.status === "open" ? "accent" : "warn"}>{c.status}</Pill>
                  </div>
                  <p className="mt-1 text-xs text-umi-muted">{c.fieldName}</p>
                  <p className="mt-2 text-sm">{c.summary}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
