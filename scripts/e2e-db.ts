import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { createDb } from "../db";
import { seedAll } from "../lib/services/seed";

/** Recreates the Playwright database, applies migrations and seeds it. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.includes("e2e")) throw new Error(`refusing to reset ${dbName}`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const c = new Client({ connectionString: admin.toString() });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await c.query(`CREATE DATABASE "${dbName}"`);
  await c.end();
  const { db, pool } = createDb(url);
  await migrate(db, { migrationsFolder: "drizzle" });
  await seedAll(db);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
