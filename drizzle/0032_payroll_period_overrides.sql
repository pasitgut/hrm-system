ALTER TABLE "payroll_runs" ADD COLUMN "overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;