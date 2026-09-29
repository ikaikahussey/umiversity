import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../db";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, pool } = createDb(url);
  await migrate(db, { migrationsFolder: "drizzle" });
  await pool.end();
  console.log("migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
