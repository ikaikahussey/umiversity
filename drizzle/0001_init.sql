CREATE TYPE "public"."badge_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."badge_type" AS ENUM('degree', 'credential', 'community', 'contributor', 'learner', 'polymath');--> statement-breakpoint
CREATE TYPE "public"."course_role_type" AS ENUM('steward', 'editor', 'contributor');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('draft', 'open', 'archived');--> statement-breakpoint
CREATE TYPE "public"."goal_type" AS ENUM('minutes', 'lessons');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'paid', 'failed', 'rolled_over', 'carried');--> statement-breakpoint
CREATE TYPE "public"."period_status" AS ENUM('open', 'computed', 'paid');--> statement-breakpoint
CREATE TYPE "public"."point_status" AS ENUM('held', 'cleared', 'clawed_back');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('open', 'promoted', 'merged', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."resource_level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."resource_source" AS ENUM('user', 'youtube_job');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('video', 'course', 'article', 'book', 'archive', 'audio', 'other');--> statement-breakpoint
CREATE TYPE "public"."revision_status" AS ENUM('proposed', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."site_role" AS ENUM('member', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."vote_target" AS ENUM('thread', 'post', 'resource');--> statement-breakpoint
CREATE TABLE "affiliate_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"resource_id" uuid,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"network" text NOT NULL,
	"domain" text NOT NULL,
	"tracking_param" text,
	"payout_eligible" boolean DEFAULT false NOT NULL,
	"terms_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_partners_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "affiliate_revenue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"network" text NOT NULL,
	"month" text NOT NULL,
	"gross_cents" integer NOT NULL,
	"reversals_cents" integer DEFAULT 0 NOT NULL,
	"net_cents" integer NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badge_endorsements" (
	"badge_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badge_endorsements_badge_id_user_id_pk" PRIMARY KEY("badge_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" "badge_type" NOT NULL,
	"field_id" uuid,
	"course_id" uuid,
	"label" text NOT NULL,
	"award_key" text,
	"details" text DEFAULT '' NOT NULL,
	"status" "badge_status" DEFAULT 'pending' NOT NULL,
	"evidence_blob_url" text,
	"evidence_delete_after" timestamp with time zone,
	"verified_by" text,
	"decided_at" timestamp with time zone,
	"display" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_reviews" (
	"user_id" text NOT NULL,
	"card_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_reviews_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "course_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"field_id" uuid NOT NULL,
	"status" "request_status" DEFAULT 'open' NOT NULL,
	"merged_into_id" uuid,
	"course_id" uuid,
	"vote_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_roles" (
	"course_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "course_role_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_roles_course_id_user_id_pk" PRIMARY KEY("course_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"overview_md" text DEFAULT '' NOT NULL,
	"keywords" text DEFAULT '' NOT NULL,
	"status" "course_status" DEFAULT 'draft' NOT NULL,
	"request_id" uuid,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', app_normalize(coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(keywords, '')))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "daily_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"lesson_id" uuid,
	"kind" text DEFAULT 'fact' NOT NULL,
	"body" text NOT NULL,
	"answer" text,
	"scheduled_for" date NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fields_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"user_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_user_id_course_id_pk" PRIMARY KEY("user_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"video_url" text,
	"audio_url" text,
	"minutes" integer DEFAULT 10 NOT NULL,
	"current_revision_id" uuid,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', app_normalize(coalesce(title, '') || ' ' || coalesce(body_md, '')))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"stripe_account_id" text NOT NULL,
	"onboarding_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"pool_cents" integer NOT NULL,
	"total_points" integer NOT NULL,
	"status" "period_status" DEFAULT 'computed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_periods_month_unique" UNIQUE("month")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"points" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"carried_in_cents" integer DEFAULT 0 NOT NULL,
	"stripe_transfer_id" text,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"points" integer NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"status" "point_status" DEFAULT 'held' NOT NULL,
	"clears_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"body_md" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"user_id" text NOT NULL,
	"lesson_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "request_votes" (
	"request_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_votes_request_id_user_id_pk" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"unit_id" uuid,
	"lesson_id" uuid,
	"added_by_id" text,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"type" "resource_type" DEFAULT 'other' NOT NULL,
	"level" "resource_level" DEFAULT 'beginner' NOT NULL,
	"source" "resource_source" DEFAULT 'user' NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"approved_by_id" text,
	"score" integer DEFAULT 0 NOT NULL,
	"partner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"base_revision_id" uuid,
	"summary" text DEFAULT '' NOT NULL,
	"status" "revision_status" DEFAULT 'proposed' NOT NULL,
	"reviewer_id" text,
	"reviewed_at" timestamp with time zone,
	"revert_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streaks" (
	"user_id" text PRIMARY KEY NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"longest" integer DEFAULT 0 NOT NULL,
	"last_active_date" date,
	"freezes_left" integer DEFAULT 1 NOT NULL,
	"freeze_week" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"unit_id" uuid,
	"lesson_id" uuid,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"accepted_post_id" uuid,
	"score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"avatar_url" text,
	"role" "site_role" DEFAULT 'member' NOT NULL,
	"timezone" text DEFAULT 'Pacific/Honolulu' NOT NULL,
	"bio" text,
	"weekly_goal_type" "goal_type" DEFAULT 'lessons' NOT NULL,
	"weekly_goal_target" integer DEFAULT 3 NOT NULL,
	"reminder_hour" smallint,
	"notify_email" boolean DEFAULT true NOT NULL,
	"digest_email" boolean DEFAULT true NOT NULL,
	"points_frozen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"user_id" text NOT NULL,
	"target_type" "vote_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votes_user_id_target_type_target_id_pk" PRIMARY KEY("user_id","target_type","target_id")
);
--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_partner_id_affiliate_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."affiliate_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_revenue" ADD CONSTRAINT "affiliate_revenue_partner_id_affiliate_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."affiliate_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_endorsements" ADD CONSTRAINT "badge_endorsements_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_endorsements" ADD CONSTRAINT "badge_endorsements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_reviews" ADD CONSTRAINT "card_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_reviews" ADD CONSTRAINT "card_reviews_card_id_daily_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."daily_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_roles" ADD CONSTRAINT "course_roles_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_roles" ADD CONSTRAINT "course_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_cards" ADD CONSTRAINT "daily_cards_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_cards" ADD CONSTRAINT "daily_cards_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_cards" ADD CONSTRAINT "daily_cards_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_period_id_payout_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payout_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_votes" ADD CONSTRAINT "request_votes_request_id_course_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."course_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_votes" ADD CONSTRAINT "request_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_clicks_partner_idx" ON "affiliate_clicks" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "badges_award_key" ON "badges" USING btree ("user_id","award_key");--> statement-breakpoint
CREATE INDEX "badges_status_idx" ON "badges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "course_requests_status_votes_idx" ON "course_requests" USING btree ("status","vote_count");--> statement-breakpoint
CREATE INDEX "course_requests_title_trgm_idx" ON "course_requests" USING gin (app_normalize("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "courses_search_idx" ON "courses" USING gin ("search_tsv");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_cards_course_day_key" ON "daily_cards" USING btree ("course_id","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_unit_slug_key" ON "lessons" USING btree ("unit_id","slug");--> statement-breakpoint
CREATE INDEX "lessons_search_idx" ON "lessons" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_period_user_key" ON "payouts" USING btree ("period_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "point_events_source_key" ON "point_events" USING btree ("user_id","type","source_type","source_id");--> statement-breakpoint
CREATE INDEX "point_events_user_idx" ON "point_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_thread_idx" ON "posts" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_course_url_key" ON "resources" USING btree ("course_id","url");--> statement-breakpoint
CREATE INDEX "revisions_lesson_idx" ON "revisions" USING btree ("lesson_id","created_at");--> statement-breakpoint
CREATE INDEX "threads_course_idx" ON "threads" USING btree ("course_id","score");--> statement-breakpoint
CREATE UNIQUE INDEX "units_course_slug_key" ON "units" USING btree ("course_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_key" ON "users" USING btree (lower("handle"));