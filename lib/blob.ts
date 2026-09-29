import "server-only";
import { del, put } from "@vercel/blob";
import type { EvidenceStore } from "@/lib/services/badges";

/** Private Vercel Blob storage for badge evidence. Files are never publicly addressable. */
export function vercelEvidenceStore(): EvidenceStore {
  return {
    async put(pathname, file) {
      const body = file.data instanceof Blob ? file.data : new Blob([file.data]);
      const res = await put(pathname, body, {
        access: "private",
        contentType: file.type,
        addRandomSuffix: true,
      });
      return res.pathname;
    },
    async del(pathname) {
      await del(pathname);
    },
  };
}
