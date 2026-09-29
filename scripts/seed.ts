import { createDb } from "../db";
import { seedAll } from "../lib/services/seed";

async function main() {
  const url = process.env.DATABASE_URL;
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
