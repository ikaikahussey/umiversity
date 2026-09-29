import { getDb } from "@/db";
import { isAuthorizedCron, unauthorized } from "@/lib/cron";
import { purgeExpiredEvidence } from "@/lib/services/badges";
import { runNightlyStreaks } from "@/lib/services/engagement";

export const maxDuration = 300;

/** Nightly: streak freezes/resets, and deletion of badge evidence 30 days after a decision. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  const db = getDb();
  const streaks = await runNightlyStreaks(db);
  let evidencePurged: number | string = "skipped: BLOB_READ_WRITE_TOKEN not set";
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { vercelEvidenceStore } = await import("@/lib/blob");
    evidencePurged = await purgeExpiredEvidence(db, vercelEvidenceStore());
  }
  return Response.json({ streaks, evidencePurged });
}
