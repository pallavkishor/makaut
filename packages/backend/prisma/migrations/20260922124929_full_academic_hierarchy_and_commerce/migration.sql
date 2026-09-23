-- Full academic hierarchy + commerce redesign
--
-- University > Program > Stream > Semester > Subject > Chapter > Note
--
-- This migration is written to PRESERVE the content that already exists in the
-- database (subjects, notes and per-subject subscriptions). Instead of dropping
-- and recreating the content tables, it:
--   1. adds the new columns as NULLABLE,
--   2. backfills them (placeholder hierarchy node, one "General" chapter per
--      subject that has notes, one inactive legacy subscription plan),
--   3. then tightens them to NOT NULL and drops the legacy columns.
--
-- The placeholder academic nodes are named "Unsorted (migrated)" so an admin can
-- rename or re-parent them from the admin panel.

-- CreateEnum
CREATE TYPE "resource_type" AS ENUM ('REFERENCE', 'PREVIOUS_YEAR_PAPER', 'QUESTION_PAPER', 'SYLLABUS', 'OTHER');

-- CreateEnum
CREATE TYPE "billing_interval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_subject_id_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_subject_id_fkey";

-- DropCheckConstraint
-- Guards start_date/end_date, both of which this migration removes. Replaced
-- further down by chk_subscriptions_period over the new period columns.
ALTER TABLE "subscriptions" DROP CONSTRAINT "valid_date_range";

-- DropIndex
DROP INDEX "idx_notes_subject";

-- DropIndex
DROP INDEX "idx_subscriptions_active";

-- DropIndex
DROP INDEX "idx_subscriptions_student";

-- DropIndex
DROP INDEX "idx_subscriptions_subject";

-- CreateTable
CREATE TABLE "universities" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "universities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" UUID NOT NULL,
    "university_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streams" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "id" UUID NOT NULL,
    "stream_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "name" VARCHAR(255),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "subject_id" UUID,
    "chapter_id" UUID,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "resource_type" "resource_type" NOT NULL,
    "storage_path" VARCHAR(1024) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "mime_type" VARCHAR(255) NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "billing_interval" "billing_interval" NOT NULL,
    "price_amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "duration_days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "razorpay_plan_id" VARCHAR(255),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subscription_id" UUID,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "status" "payment_status" NOT NULL DEFAULT 'CREATED',
    "provider" VARCHAR(50) NOT NULL DEFAULT 'razorpay',
    "razorpay_order_id" VARCHAR(255),
    "razorpay_payment_id" VARCHAR(255),
    "raw_payload" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_progress" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reading_progress_pkey" PRIMARY KEY ("id")
);

-- AlterTable
-- Primary keys are generated by the application (Prisma @default(uuid())), so
-- the database-side gen_random_uuid() defaults are dropped to match the schema.
ALTER TABLE "administrators" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "registered_devices" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "selected_program_id" UUID,
ADD COLUMN     "selected_semester_id" UUID,
ADD COLUMN     "selected_stream_id" UUID,
ADD COLUMN     "selected_university_id" UUID,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
-- semester_id starts NULLABLE so existing subjects can be backfilled.
ALTER TABLE "subjects" ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "semester_id" UUID,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
-- chapter_id starts NULLABLE so existing notes can be re-parented.
ALTER TABLE "notes" ADD COLUMN     "chapter_id" UUID,
ADD COLUMN     "is_published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
-- plan_id / current_period_* start NULLABLE so existing rows can be backfilled
-- from start_date / end_date.
ALTER TABLE "subscriptions" ADD COLUMN     "cancelled_at" TIMESTAMP,
ADD COLUMN     "current_period_end" TIMESTAMP,
ADD COLUMN     "current_period_start" TIMESTAMP,
ADD COLUMN     "plan_id" UUID,
ADD COLUMN     "razorpay_subscription_id" VARCHAR(255),
ADD COLUMN     "status" "subscription_status" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "id" DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- Data migration
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_university_id UUID;
    v_program_id    UUID;
    v_stream_id     UUID;
    v_semester_id   UUID;
    v_plan_id       UUID;
    v_subject_id    UUID;
    v_chapter_id    UUID;
BEGIN
    -- 1. Park pre-existing subjects under a placeholder hierarchy node.
    IF EXISTS (SELECT 1 FROM "subjects") THEN
        INSERT INTO "universities" ("id", "name")
        VALUES (gen_random_uuid(), 'Unsorted (migrated)')
        RETURNING "id" INTO v_university_id;

        INSERT INTO "programs" ("id", "university_id", "name")
        VALUES (gen_random_uuid(), v_university_id, 'Unsorted (migrated)')
        RETURNING "id" INTO v_program_id;

        INSERT INTO "streams" ("id", "program_id", "name")
        VALUES (gen_random_uuid(), v_program_id, 'Unsorted (migrated)')
        RETURNING "id" INTO v_stream_id;

        INSERT INTO "semesters" ("id", "stream_id", "number", "name")
        VALUES (gen_random_uuid(), v_stream_id, 1, 'Unsorted (migrated)')
        RETURNING "id" INTO v_semester_id;

        UPDATE "subjects" SET "semester_id" = v_semester_id WHERE "semester_id" IS NULL;
    END IF;

    -- 2. Give every subject that already has notes a "General" chapter, and
    --    re-parent its notes onto it.
    FOR v_subject_id IN SELECT DISTINCT "subject_id" FROM "notes" LOOP
        INSERT INTO "chapters" ("id", "subject_id", "title", "position")
        VALUES (gen_random_uuid(), v_subject_id, 'General', 0)
        RETURNING "id" INTO v_chapter_id;

        UPDATE "notes"
        SET "chapter_id" = v_chapter_id
        WHERE "subject_id" = v_subject_id;
    END LOOP;

    -- 3. Convert per-subject subscriptions into account-level subscriptions on a
    --    single inactive legacy plan (is_active = false so it is not sellable).
    IF EXISTS (SELECT 1 FROM "subscriptions") THEN
        INSERT INTO "subscription_plans" (
            "id", "name", "code", "billing_interval", "price_amount",
            "currency", "duration_days", "is_active"
        )
        VALUES (
            gen_random_uuid(), 'Legacy Migrated Access', 'legacy-migrated',
            'YEARLY', 0, 'INR', 365, false
        )
        RETURNING "id" INTO v_plan_id;

        UPDATE "subscriptions"
        SET "plan_id"              = v_plan_id,
            "current_period_start" = "start_date",
            "current_period_end"   = "end_date",
            "status"               = CASE
                WHEN CURRENT_TIMESTAMP < "start_date" THEN 'PENDING'::"subscription_status"
                WHEN CURRENT_TIMESTAMP > "end_date"   THEN 'EXPIRED'::"subscription_status"
                ELSE 'ACTIVE'::"subscription_status"
            END
        WHERE "plan_id" IS NULL;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Tighten the backfilled columns and drop the legacy ones
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "subjects" ALTER COLUMN "semester_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "notes" ALTER COLUMN "chapter_id" SET NOT NULL,
DROP COLUMN "subject_id";

-- AlterTable
ALTER TABLE "subscriptions" ALTER COLUMN "plan_id" SET NOT NULL,
ALTER COLUMN "current_period_start" SET NOT NULL,
ALTER COLUMN "current_period_end" SET NOT NULL,
DROP COLUMN "start_date",
DROP COLUMN "end_date",
DROP COLUMN "subject_id";

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX "idx_students_selected_university" ON "students"("selected_university_id");

-- CreateIndex
CREATE INDEX "idx_students_selected_program" ON "students"("selected_program_id");

-- CreateIndex
CREATE INDEX "idx_students_selected_stream" ON "students"("selected_stream_id");

-- CreateIndex
CREATE INDEX "idx_students_selected_semester" ON "students"("selected_semester_id");

-- CreateIndex
CREATE INDEX "idx_programs_university" ON "programs"("university_id");

-- CreateIndex
CREATE INDEX "idx_streams_program" ON "streams"("program_id");

-- CreateIndex
CREATE INDEX "idx_semesters_stream" ON "semesters"("stream_id");

-- CreateIndex
CREATE INDEX "idx_subjects_semester_position" ON "subjects"("semester_id", "position");

-- CreateIndex
CREATE INDEX "idx_chapters_subject_position" ON "chapters"("subject_id", "position");

-- CreateIndex
CREATE INDEX "idx_notes_chapter_position" ON "notes"("chapter_id", "position");

-- CreateIndex
CREATE INDEX "idx_resources_subject_published" ON "resources"("subject_id", "is_published");

-- CreateIndex
CREATE INDEX "idx_resources_chapter" ON "resources"("chapter_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_razorpay_plan_id_key" ON "subscription_plans"("razorpay_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_razorpay_subscription_id_key" ON "subscriptions"("razorpay_subscription_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_student_status_end" ON "subscriptions"("student_id", "status", "current_period_end");

-- CreateIndex
CREATE INDEX "idx_subscriptions_plan" ON "subscriptions"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_razorpay_payment_id_key" ON "payments"("razorpay_payment_id");

-- CreateIndex
CREATE INDEX "idx_payments_student" ON "payments"("student_id");

-- CreateIndex
CREATE INDEX "idx_payments_subscription" ON "payments"("subscription_id");

-- CreateIndex
CREATE INDEX "idx_payments_razorpay_order" ON "payments"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_bookmarks_student_note" ON "bookmarks"("student_id", "note_id");

-- CreateIndex
CREATE INDEX "idx_bookmarks_student" ON "bookmarks"("student_id");

-- CreateIndex
CREATE INDEX "idx_bookmarks_note" ON "bookmarks"("note_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_reading_progress_student_note" ON "reading_progress"("student_id", "note_id");

-- CreateIndex
CREATE INDEX "idx_reading_progress_student_viewed" ON "reading_progress"("student_id", "last_viewed_at");

-- CreateIndex
CREATE INDEX "idx_reading_progress_note" ON "reading_progress"("note_id");

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_selected_university_id_fkey" FOREIGN KEY ("selected_university_id") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_selected_program_id_fkey" FOREIGN KEY ("selected_program_id") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_selected_stream_id_fkey" FOREIGN KEY ("selected_stream_id") REFERENCES "streams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_selected_semester_id_fkey" FOREIGN KEY ("selected_semester_id") REFERENCES "semesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streams" ADD CONSTRAINT "streams_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Full-text search on notes
--
-- Prisma cannot express a generated tsvector column, so it is created here in
-- raw SQL. The Prisma model carries it as `Unsupported("tsvector")?`, which
-- keeps Prisma Client from ever reading or writing it - PostgreSQL maintains it
-- on every INSERT/UPDATE. Query it with $queryRaw, e.g.
--
--   SELECT id, title FROM notes
--   WHERE search_vector @@ websearch_to_tsquery('english', $1)
--   ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', $1)) DESC;
--
-- The title is weighted above the body so title hits rank first.
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "notes" ADD COLUMN "search_vector" tsvector
GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("content", '')), 'B')
) STORED;

-- CreateIndex
CREATE INDEX "idx_notes_search_vector" ON "notes" USING GIN ("search_vector");

-- ---------------------------------------------------------------------------
-- Check constraints
-- ---------------------------------------------------------------------------

ALTER TABLE "reading_progress" ADD CONSTRAINT "chk_reading_progress_percent" CHECK ("progress_percent" >= 0 AND "progress_percent" <= 100);

ALTER TABLE "subscriptions" ADD CONSTRAINT "chk_subscriptions_period" CHECK ("current_period_end" > "current_period_start");

ALTER TABLE "subjects" ADD CONSTRAINT "chk_subjects_position" CHECK ("position" >= 0);

ALTER TABLE "chapters" ADD CONSTRAINT "chk_chapters_position" CHECK ("position" >= 0);

ALTER TABLE "notes" ADD CONSTRAINT "chk_notes_position" CHECK ("position" >= 0);

ALTER TABLE "resources" ADD CONSTRAINT "chk_resources_position" CHECK ("position" >= 0);
