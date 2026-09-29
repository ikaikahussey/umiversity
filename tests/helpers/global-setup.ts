import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { createDb } from "../../db";

const TEST_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/umiversity_test";

/** Recreates the test database from migrations once per run. */
export default async function setup() {
  const url = new URL(TEST_URL);
  const dbName = url.pathname.slice(1);
  if (!dbName.includes("test")) throw new Error(`refusing to reset non-test database ${dbName}`);
  const adminUrl = new URL(TEST_URL);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const { db, pool } = createDb(TEST_URL);
  await migrate(db, { migrationsFolder: "drizzle" });
  await pool.end();
}
