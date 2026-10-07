ALTER TABLE "employees"
  ADD COLUMN "weekly_holidays" integer[] NOT NULL DEFAULT '{}'::integer[];
--> statement-breakpoint

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_weekly_holidays_valid"
  CHECK ("weekly_holidays" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]);
