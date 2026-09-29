import { getDb } from "@/db";
import { isAuthorizedCron, unauthorized } from "@/lib/cron";
import { suggestYouTubeResources } from "@/lib/services/youtube";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return Response.json({ skipped: "YOUTUBE_API_KEY not set" });
  const result = await suggestYouTubeResources(getDb(), { apiKey });
  return Response.json(result);
}
