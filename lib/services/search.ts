import { sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { buildTsQuery } from "@/lib/text";

export type SearchHit =
  | { kind: "course"; title: string; href: string; snippet: string }
  | { kind: "lesson"; title: string; href: string; snippet: string; courseTitle: string }
  | { kind: "field"; title: string; href: string; snippet: string };

/**
 * Full-text search over courses, lessons and fields. Both the documents and the
 * query are folded with app_normalize, so "olelo" matches "ʻŌlelo" and vice versa.
 */
export async function search(db: Tx, q: string, limit = 20): Promise<SearchHit[]> {
  const tsq = buildTsQuery(q);
  if (!tsq) return [];

  const courses = await db.execute<{ title: string; slug: string; summary: string; rank: number }>(sql`
    SELECT title, slug, summary, ts_rank(search_tsv, to_tsquery('simple', ${tsq})) AS rank
    FROM courses
    WHERE status <> 'archived' AND search_tsv @@ to_tsquery('simple', ${tsq})
    ORDER BY rank DESC, title
    LIMIT ${limit}`);

  const lessons = await db.execute<{
    title: string;
    lesson_slug: string;
    unit_slug: string;
    course_slug: string;
    course_title: string;
    body_md: string;
  }>(sql`
    SELECT l.title, l.slug AS lesson_slug, u.slug AS unit_slug, c.slug AS course_slug,
           c.title AS course_title, left(l.body_md, 400) AS body_md
    FROM lessons l
    JOIN units u ON u.id = l.unit_id
    JOIN courses c ON c.id = u.course_id
    WHERE c.status <> 'archived' AND l.search_tsv @@ to_tsquery('simple', ${tsq})
    ORDER BY ts_rank(l.search_tsv, to_tsquery('simple', ${tsq})) DESC, l.title
    LIMIT ${limit}`);

  const fields = await db.execute<{ name: string; slug: string; domain: string }>(sql`
    SELECT f.name, f.slug, d.name AS domain
    FROM fields f JOIN domains d ON d.id = f.domain_id
    WHERE to_tsvector('simple', app_normalize(f.name)) @@ to_tsquery('simple', ${tsq})
    ORDER BY f.name
    LIMIT ${limit}`);

  return [
    ...courses.rows.map((r) => ({
      kind: "course" as const,
      title: r.title,
      href: `/c/${r.slug}`,
      snippet: r.summary,
    })),
    ...lessons.rows.map((r) => ({
      kind: "lesson" as const,
      title: r.title,
      href: `/c/${r.course_slug}/${r.unit_slug}/${r.lesson_slug}`,
      snippet: r.body_md.replace(/[#*_>`]/g, "").slice(0, 160),
      courseTitle: r.course_title,
    })),
    ...fields.rows.map((r) => ({
      kind: "field" as const,
      title: r.name,
      href: `/search?q=${encodeURIComponent(r.name)}`,
      snippet: r.domain,
    })),
  ];
}
