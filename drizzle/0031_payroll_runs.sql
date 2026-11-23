CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"month" smallint NOT NULL,
	"status" varchar(30) DEFAULT 'review' NOT NULL,
	"verified_employee_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"snapshot" jsonb,
	"submitted_by_user_id" uuid,
	"submitted_by_name" varchar(255),
	"submitted_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"approved_by_name" varchar(255),
	"approved_at" timestamp with time zone,
	"locked_by_user_id" uuid,
	"locked_by_name" varchar(255),
	"locked_at" timestamp with time zone,
	"paid_by_user_id" uuid,
	"paid_by_name" varchar(255),
	"paid_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_runs_year_valid" CHECK ("payroll_runs"."year" >= 1900 AND "payroll_runs"."year" <= 2200),
	CONSTRAINT "payroll_runs_month_valid" CHECK ("payroll_runs"."month" >= 1 AND "payroll_runs"."month" <= 12),
	CONSTRAINT "payroll_runs_status_valid" CHECK ("payroll_runs"."status" IN ('review', 'pending_approval', 'approved', 'locked', 'paid'))
);
--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_locked_by_user_id_users_id_fk" FOREIGN KEY ("locked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_year_month_unique" ON "payroll_runs" USING btree ("year","month");
--> statement-breakpoint
ALTER TABLE "payroll_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "payroll_runs" FROM PUBLIC;
