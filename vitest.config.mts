import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/helpers/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/umiversity_test",
    },
  },
});
