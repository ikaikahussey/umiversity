import { sql } from "drizzle-orm";
import { afterAll } from "vitest";
import { createDb, schema, type Db } from "@/db";

const { db, pool } = createDb(process.env.DATABASE_URL!);
afterAll(async () => {
  await pool.end();
});

export const testDb: Db = db;

/** Empties every app table between tests. */
export async function resetDb() {
  const res = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '__drizzle%'",
  );
  const names = res.rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
}

let seq = 0;
export async function makeUser(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  seq += 1;
  const [u] = await db
    .insert(schema.users)
    .values({
      id: overrides.id ?? `user-${seq}-${Math.random().toString(36).slice(2, 8)}`,
      handle: overrides.handle ?? `user${seq}${Math.random().toString(36).slice(2, 6)}`,
      name: overrides.name ?? `User ${seq}`,
      createdAt: overrides.createdAt ?? new Date(Date.now() - 90 * 86400000),
      ...overrides,
    })
    .returning();
  return u;
}

export async function makeField(name = "Languages", domainName = "Languages") {
  const slugBase = `${name}-${Math.random().toString(36).slice(2, 7)}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const [d] = await db
    .insert(schema.domains)
    .values({ name: domainName, slug: `d-${slugBase}` })
    .returning();
  const [f] = await db.insert(schema.fields).values({ domainId: d.id, name, slug: slugBase }).returning();
  return { domain: d, field: f };
}
