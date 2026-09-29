import Link from "next/link";
import { Card, PageTitle, Pill } from "@/components/ui";
import { getDb } from "@/db";
import { search } from "@/lib/services/search";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const hits = q ? await search(getDb(), q) : [];
  return (
    <main>
      <PageTitle sub="Spelling with or without ʻokina and kahakō both work.">Search</PageTitle>
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} className="flex-1 rounded border border-line px-2 py-1.5" aria-label="Query" />
        <button className="rounded bg-accent px-3 text-white">Search</button>
      </form>
      {q && hits.length === 0 && <p className="text-sm text-muted">No results for “{q}”.</p>}
      <ul className="flex flex-col gap-2" data-testid="search-results">
        {hits.map((h) => (
          <li key={`${h.kind}-${h.href}`}>
            <Card>
              <div className="flex items-center gap-2">
                <Pill>{h.kind}</Pill>
                <Link href={h.href} className="font-medium text-accent">
                  {h.title}
                </Link>
                {h.kind === "lesson" && <span className="text-xs text-muted">in {h.courseTitle}</span>}
              </div>
              {h.snippet && <p className="mt-1 text-sm text-muted">{h.snippet}</p>}
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
