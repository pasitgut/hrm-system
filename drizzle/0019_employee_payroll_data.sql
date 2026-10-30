ALTER TABLE "employees"
ADD COLUMN "payroll_data" jsonb NOT NULL DEFAULT '{}'::jsonb;
