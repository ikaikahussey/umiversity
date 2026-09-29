# Umiversity

A social learning network for polymaths. People request courses, vote them into
existence, build them together wiki-style, discuss them, and track progress
across many fields. Launch courses: **ʻŌlelo Hawaiʻi** and **Moʻolelo Hawaiʻi**.

Stack: Next.js 16 (App Router, TypeScript strict), Neon Postgres, Drizzle ORM,
Neon Auth, Vercel Blob, Resend, Vercel Cron, Tailwind CSS. Installable as a PWA.

## Local development

```bash
pnpm install
cp .env.example .env.local        # fill in DATABASE_URL and Neon Auth values
pnpm db:migrate && pnpm db:seed   # schema, domains/fields, launch courses
pnpm dev
```

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test   # Vitest unit + integration (needs Postgres)
pnpm test:e2e                              # Playwright key flows
```

Integration tests recreate `umiversity_test` on `TEST_DATABASE_URL`
(default `postgres://postgres:postgres@localhost:5432/umiversity_test`).
Playwright recreates `umiversity_e2e`, seeds it, and runs `next dev` with
`E2E_TEST_AUTH=1`, which lets tests sign in with a cookie. That override is
ignored on Vercel and in production builds.

## Layout

| Path | Contents |
| --- | --- |
| `db/schema.ts`, `drizzle/` | Drizzle schema and SQL migrations (`0000_extensions.sql` adds `unaccent`, `pg_trgm` and `app_normalize`) |
| `db/seed/` | Domains, fields and launch course content |
| `lib/services/` | Domain logic; each function takes a DB handle and is tested directly |
| `app/actions/` | Server actions: thin wrappers over services |
| `app/api/cron/*` | Vercel Cron jobs (bearer `CRON_SECRET`) |
| `proxy.ts` | Route protection with Neon Auth |

## Search

`app_normalize()` strips the ʻokina (U+02BB) and apostrophe stand-ins, removes
kahakō and other diacritics with `unaccent`, and lowercases. Generated
`tsvector` columns on courses and lessons use it, so “olelo”, “ʻŌlelo” and
“Olelo” all match. Request duplicate detection uses `pg_trgm` similarity on the
same folded titles.

## Cron jobs (`vercel.json`)

| Route | Schedule | Job |
| --- | --- | --- |
| `/api/cron/streaks` | daily | Streak freezes/resets; delete badge evidence 30 days after decision |
| `/api/cron/youtube` | daily | YouTube suggestions per course, hidden until an Editor approves |
| `/api/cron/reminders` | hourly | Reminder email at each user's chosen local hour |
| `/api/cron/digest` | weekly | Digest of new threads and badges in followed courses |
| `/api/cron/payouts` | monthly | Clear held points, compute the month two back, send Stripe transfers |

Hourly crons require a Vercel Pro plan.

## Payouts

Pool = 50% (`PAYOUT_POOL_PERCENT`) of net revenue received in a month from
partners marked `payout_eligible`. Points are held 30 days and clawed back if
the edit is reverted or the acceptance reversed. Distribution is pro rata by
cleared points, capped at 5% of the pool per person; totals under $10 roll
over. Points earned in an account's first 30 days and points of frozen users
are excluded. Transfers go through Stripe Connect Express.
