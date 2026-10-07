ALTER TABLE "employees"
  ADD COLUMN "base_salary" numeric(12, 2),
  ADD COLUMN "ot_weekday_multiplier" numeric(5, 2) NOT NULL DEFAULT 1.5,
  ADD COLUMN "ot_holiday_multiplier" numeric(5, 2) NOT NULL DEFAULT 3,
  ADD COLUMN "work_hours_per_day" numeric(5, 2) NOT NULL DEFAULT 8;
--> statement-breakpoint

ALTER TABLE "overtime_requests"
  ADD COLUMN "overtime_type" varchar(20);
