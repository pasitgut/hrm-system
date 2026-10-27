CREATE TABLE "salary_slip_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "files" jsonb NOT NULL,
  "rows" jsonb NOT NULL,
  "committed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "salary_slips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
  "year" integer NOT NULL CONSTRAINT "salary_slips_year_valid" CHECK ("year" BETWEEN 1900 AND 2200),
  "month" smallint NOT NULL CONSTRAINT "salary_slips_month_valid" CHECK ("month" BETWEEN 1 AND 12),
  "revision" integer NOT NULL DEFAULT 1 CONSTRAINT "salary_slips_revision_valid" CHECK ("revision" > 0),
  "data" jsonb NOT NULL,
  "income_total" numeric(12,2) NOT NULL,
  "deduction_total" numeric(12,2) NOT NULL,
  "net_pay" numeric(12,2) NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "salary_slips_employee_period_unique" ON "salary_slips" ("employee_id", "year", "month");
--> statement-breakpoint
CREATE TABLE "salary_slip_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slip_id" uuid NOT NULL REFERENCES "salary_slips"("id"),
  "import_id" uuid NOT NULL REFERENCES "salary_slip_imports"("id"),
  "revision" integer NOT NULL,
  "data" jsonb NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "reason" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "salary_slip_versions_revision_unique" ON "salary_slip_versions" ("slip_id", "revision");
