import { createDb } from "../db";
import { seedAll } from "../lib/services/seed";

async function main() {
  // Neon: prefer the direct (unpooled) connection for DDL and bulk writes.
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, pool } = createDb(url);
  await seedAll(db);
  await pool.end();
  console.log("seed complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
