import { eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { domains, fields } from "@/db/schema";
import { TAXONOMY } from "@/db/seed/taxonomy";

/** Inserts domains and fields; safe to run repeatedly. */
export async function seedTaxonomy(db: Tx) {
  for (const d of TAXONOMY) {
    await db.insert(domains).values({ name: d.domain, slug: d.slug }).onConflictDoNothing();
    const [dom] = await db.select().from(domains).where(eq(domains.slug, d.slug));
    for (const f of d.fields) {
      await db
        .insert(fields)
        .values({ domainId: dom.id, name: f.name, slug: f.slug })
        .onConflictDoNothing();
    }
  }
}

/** Everything a fresh environment needs. */
export async function seedAll(db: Tx) {
  await seedTaxonomy(db);
}
