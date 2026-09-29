import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
/** Neon Auth user ids are stored as text so the app does not depend on the neon_auth schema. */
const userRef = (name: string) => text(name);

export const siteRole = pgEnum("site_role", ["member", "moderator", "admin"]);
export const requestStatus = pgEnum("request_status", ["open", "promoted", "merged", "rejected"]);
export const courseStatus = pgEnum("course_status", ["draft", "open", "archived"]);
export const courseRoleType = pgEnum("course_role_type", ["steward", "editor", "contributor"]);
export const revisionStatus = pgEnum("revision_status", ["proposed", "approved", "rejected"]);
export const resourceType = pgEnum("resource_type", [
  "video",
  "course",
  "article",
  "book",
  "archive",
  "audio",
  "other",
]);
export const resourceLevel = pgEnum("resource_level", ["beginner", "intermediate", "advanced"]);
export const resourceSource = pgEnum("resource_source", ["user", "youtube_job"]);
export const voteTarget = pgEnum("vote_target", ["thread", "post", "resource"]);
export const badgeType = pgEnum("badge_type", [
  "degree",
  "credential",
  "community",
  "contributor",
  "learner",
  "polymath",
]);
export const badgeStatus = pgEnum("badge_status", ["pending", "verified", "rejected"]);
export const goalType = pgEnum("goal_type", ["minutes", "lessons"]);
export const pointStatus = pgEnum("point_status", ["held", "cleared", "clawed_back"]);
export const periodStatus = pgEnum("period_status", ["open", "computed", "paid"]);
export const payoutStatus = pgEnum("payout_status", [
  "pending",
  "paid",
  "failed",
  "rolled_over",
  "carried",
]);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    handle: text("handle").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    role: siteRole("role").notNull().default("member"),
    timezone: text("timezone").notNull().default("Pacific/Honolulu"),
    bio: text("bio"),
    weeklyGoalType: goalType("weekly_goal_type").notNull().default("lessons"),
    weeklyGoalTarget: integer("weekly_goal_target").notNull().default(3),
    reminderHour: smallint("reminder_hour"),
    notifyEmail: boolean("notify_email").notNull().default(true),
    digestEmail: boolean("digest_email").notNull().default(true),
    pointsFrozen: boolean("points_frozen").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_handle_key").on(sql`lower(${t.handle})`)],
);

export const domains = pgTable("domains", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

export const fields = pgTable("fields", {
  id: id(),
  domainId: uuid("domain_id")
    .notNull()
    .references(() => domains.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

export const courseRequests = pgTable(
  "course_requests",
  {
    id: id(),
    requesterId: userRef("requester_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fields.id),
    status: requestStatus("status").notNull().default("open"),
    mergedIntoId: uuid("merged_into_id"),
    courseId: uuid("course_id"),
    voteCount: integer("vote_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("course_requests_status_votes_idx").on(t.status, t.voteCount),
    index("course_requests_title_trgm_idx").using("gin", sql`app_normalize(${t.title}) gin_trgm_ops`),
  ],
);

export const requestVotes = pgTable(
  "request_votes",
  {
    requestId: uuid("request_id")
      .notNull()
      .references(() => courseRequests.id, { onDelete: "cascade" }),
    userId: userRef("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.userId] })],
);

export const courses = pgTable(
  "courses",
  {
    id: id(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fields.id),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    summary: text("summary").notNull().default(""),
    overviewMd: text("overview_md").notNull().default(""),
    keywords: text("keywords").notNull().default(""),
    status: courseStatus("status").notNull().default("draft"),
    requestId: uuid("request_id"),
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`to_tsvector('simple', app_normalize(coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(keywords, '')))`,
    ),
    createdAt: createdAt(),
  },
  (t) => [index("courses_search_idx").using("gin", t.searchTsv)],
);

export const courseRoles = pgTable(
  "course_roles",
  {
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: userRef("user_id")
      .notNull()
      .references(() => users.id),
    role: courseRoleType("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.userId] })],
);

export const units = pgTable(
  "units",
  {
    id: id(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("units_course_slug_key").on(t.courseId, t.slug)],
);

export const lessons = pgTable(
  "lessons",
  {
    id: id(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull().default(""),
    videoUrl: text("video_url"),
    audioUrl: text("audio_url"),
    minutes: integer("minutes").notNull().default(10),
    currentRevisionId: uuid("current_revision_id"),
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`to_tsvector('simple', app_normalize(coalesce(title, '') || ' ' || coalesce(body_md, '')))`,
    ),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("lessons_unit_slug_key").on(t.unitId, t.slug),
    index("lessons_search_idx").using("gin", t.searchTsv),
  ],
);

export const revisions = pgTable(
  "revisions",
  {
    id: id(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    authorId: userRef("author_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    baseRevisionId: uuid("base_revision_id"),
    summary: text("summary").notNull().default(""),
    status: revisionStatus("status").notNull().default("proposed"),
    reviewerId: userRef("reviewer_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    revertOfId: uuid("revert_of_id"),
    createdAt: createdAt(),
  },
  (t) => [index("revisions_lesson_idx").on(t.lessonId, t.createdAt)],
);

export const resources = pgTable(
  "resources",
  {
    id: id(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    addedById: userRef("added_by_id").references(() => users.id),
    url: text("url").notNull(),
    title: text("title").notNull(),
    type: resourceType("type").notNull().default("other"),
    level: resourceLevel("level").notNull().default("beginner"),
    source: resourceSource("source").notNull().default("user"),
    approved: boolean("approved").notNull().default(false),
    approvedById: userRef("approved_by_id").references(() => users.id),
    score: integer("score").notNull().default(0),
    partnerId: uuid("partner_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("resources_course_url_key").on(t.courseId, t.url)],
);

export const threads = pgTable(
  "threads",
  {
    id: id(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    authorId: userRef("author_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    acceptedPostId: uuid("accepted_post_id"),
    score: integer("score").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("threads_course_idx").on(t.courseId, t.score)],
);

export const posts = pgTable(
  "posts",
  {
    id: id(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    authorId: userRef("author_id")
      .notNull()
      .references(() => users.id),
    bodyMd: text("body_md").notNull(),
    score: integer("score").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("posts_thread_idx").on(t.threadId)],
);

export const votes = pgTable(
  "votes",
  {
    userId: userRef("user_id")
      .notNull()
      .references(() => users.id),
    targetType: voteTarget("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    value: smallint("value").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetType, t.targetId] })],
);

export const badges = pgTable(
  "badges",
  {
    id: id(),
    userId: userRef("user_id")
      .notNull()
      .references(() => users.id),
    type: badgeType("type").notNull(),
    fieldId: uuid("field_id").references(() => fields.id),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Automatic badges use a stable key so they are awarded once. */
    awardKey: text("award_key"),
    details: text("details").notNull().default(""),
    status: badgeStatus("status").notNull().default("pending"),
    evidenceBlobUrl: text("evidence_blob_url"),
    evidenceDeleteAfter: timestamp("evidence_delete_after", { withTimezone: true }),
    verifiedBy: userRef("verified_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    display: boolean("display").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("badges_award_key").on(t.userId, t.awardKey),
    index("badges_status_idx").on(t.status),
  ],
);

export const badgeEndorsements = pgTable(
  "badge_endorsements",
  {
    badgeId: uuid("badge_id")
      .notNull()
      .references(() => badges.id, { onDelete: "cascade" }),
    userId: userRef("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.badgeId, t.userId] })],
);

export const progress = pgTable(
  "progress",
  {
    userId: userRef("user_id")
      .notNull()
      .references(() => users.id),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);

export const follows = pgTable(
  "follows",
  {
    userId: userRef("user_id")
      .notNull()
      .references(() => users.id),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId] })],
);

export const dailyCards = pgTable(
  "daily_cards",
  {
    id: id(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("fact"),
    body: text("body").notNull(),
    answer: text("answer"),
    scheduledFor: date("scheduled_for").notNull(),
    authorId: userRef("author_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("daily_cards_course_day_key").on(t.courseId, t.scheduledFor)],
);

export const cardReviews = pgTable(
  "card_reviews",
  {
    userId: userRef("user_id")
      .notNull()
      .references(() => users.id),
    cardId: uuid("card_id")
      .notNull()
      .references(() => dailyCards.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cardId] })],
);

export const streaks = pgTable("streaks", {
  userId: userRef("user_id")
    .primaryKey()
    .references(() => users.id),
  current: integer("current").notNull().default(0),
  longest: integer("longest").notNull().default(0),
  lastActiveDate: date("last_active_date"),
  freezesLeft: integer("freezes_left").notNull().default(1),
  freezeWeek: text("freeze_week"),
  createdAt: createdAt(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: userRef("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const affiliatePartners = pgTable("affiliate_partners", {
  id: id(),
  name: text("name").notNull(),
  network: text("network").notNull(),
  domain: text("domain").notNull().unique(),
  /** Query-string parameter appended to outbound links, e.g. "ref=umiversity". */
  trackingParam: text("tracking_param"),
  payoutEligible: boolean("payout_eligible").notNull().default(false),
  termsNote: text("terms_note").notNull().default(""),
  createdAt: createdAt(),
});

export const affiliateClicks = pgTable(
  "affiliate_clicks",
  {
    id: id(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => affiliatePartners.id),
    resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "set null" }),
    userId: userRef("user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("affiliate_clicks_partner_idx").on(t.partnerId, t.createdAt)],
);

export const affiliateRevenue = pgTable("affiliate_revenue", {
  id: id(),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => affiliatePartners.id),
  network: text("network").notNull(),
  /** Month the cash was received, formatted YYYY-MM. */
  month: text("month").notNull(),
  grossCents: integer("gross_cents").notNull(),
  reversalsCents: integer("reversals_cents").notNull().default(0),
  netCents: integer("net_cents").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const pointEvents = pgTable(
  "point_events",
  {
    id: id(),
    userId: userRef("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type").notNull(),
    points: integer("points").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    status: pointStatus("status").notNull().default("held"),
    clearsAt: timestamp("clears_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("point_events_source_key").on(t.userId, t.type, t.sourceType, t.sourceId),
    index("point_events_user_idx").on(t.userId, t.createdAt),
  ],
);

export const payoutPeriods = pgTable("payout_periods", {
  id: id(),
  month: text("month").notNull().unique(),
  poolCents: integer("pool_cents").notNull(),
  totalPoints: integer("total_points").notNull(),
  status: periodStatus("status").notNull().default("computed"),
  createdAt: createdAt(),
});

export const payouts = pgTable(
  "payouts",
  {
    id: id(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => payoutPeriods.id),
    userId: userRef("user_id")
      .notNull()
      .references(() => users.id),
    points: integer("points").notNull(),
    amountCents: integer("amount_cents").notNull(),
    carriedInCents: integer("carried_in_cents").notNull().default(0),
    stripeTransferId: text("stripe_transfer_id"),
    status: payoutStatus("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payouts_period_user_key").on(t.periodId, t.userId)],
);

export const payoutAccounts = pgTable("payout_accounts", {
  userId: userRef("user_id")
    .primaryKey()
    .references(() => users.id),
  stripeAccountId: text("stripe_account_id").notNull(),
  onboardingStatus: text("onboarding_status").notNull().default("pending"),
  createdAt: createdAt(),
});
