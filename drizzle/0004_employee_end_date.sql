ALTER TABLE "employees" ADD COLUMN "end_date" date;--> statement-breakpoint
UPDATE "employees"
SET "end_date" = ("deleted_at" AT TIME ZONE 'Asia/Bangkok')::date
WHERE "deleted_at" IS NOT NULL;
