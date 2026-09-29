import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
/** A database handle or an open transaction; services accept either. */
export type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __umiDb?: Db; __umiPool?: Pool };

export function createDb(url: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString: url, max: 5 });
  return { db: drizzle(pool, { schema }), pool };
}

/** Lazily creates the shared connection so builds do not need DATABASE_URL. */
export function getDb(): Db {
  if (!globalForDb.__umiDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const { db, pool } = createDb(url);
    globalForDb.__umiDb = db;
    globalForDb.__umiPool = pool;
  }
  return globalForDb.__umiDb;
}

export { schema };
