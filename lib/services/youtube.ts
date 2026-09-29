import { sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { courses, resources } from "@/db/schema";

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

type YouTubeSearch = {
  items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[];
};

function decodeEntities(s: string) {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Nightly job: searches YouTube for each active course's keywords and stores
 * new videos as hidden suggestions (approved = false) for Editors to review.
 */
export async function suggestYouTubeResources(
  db: Tx,
  opts: { apiKey: string; fetchImpl?: FetchLike; perCourse?: number },
): Promise<{ courses: number; added: number; errors: string[] }> {
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const perCourse = opts.perCourse ?? 5;
  const active = await db.select().from(courses).where(sql`${courses.status} <> 'archived'`);
  let added = 0;
  const errors: string[] = [];
  for (const c of active) {
    const q = (c.keywords || c.title).slice(0, 200);
    const url =
      "https://www.googleapis.com/youtube/v3/search?" +
      new URLSearchParams({
        part: "snippet",
        type: "video",
        safeSearch: "strict",
        videoEmbeddable: "true",
        maxResults: String(perCourse),
        q,
        key: opts.apiKey,
      }).toString();
    let data: YouTubeSearch;
    try {
      const res = await fetchImpl(url);
      if (!res.ok) {
        errors.push(`${c.slug}: HTTP ${res.status}`);
        continue;
      }
      data = (await res.json()) as YouTubeSearch;
    } catch (err) {
      errors.push(`${c.slug}: ${(err as Error).message}`);
      continue;
    }
    for (const item of data.items ?? []) {
      const videoId = item.id?.videoId;
      const title = item.snippet?.title;
      if (!videoId || !title || !/^[\w-]{11}$/.test(videoId)) continue;
      const inserted = await db
        .insert(resources)
        .values({
          courseId: c.id,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: decodeEntities(title).slice(0, 200),
          type: "video",
          level: "beginner",
          source: "youtube_job",
          approved: false,
        })
        .onConflictDoNothing()
        .returning({ id: resources.id });
      added += inserted.length;
    }
  }
  return { courses: active.length, added, errors };
}

