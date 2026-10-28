CREATE TABLE "work_tracking_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"house_no" varchar(120) NOT NULL,
	"round" varchar(40) NOT NULL,
	"event_date" date NOT NULL,
	"project_text" text NOT NULL DEFAULT '',
	"detail" text NOT NULL DEFAULT '',
	"status" varchar(20) NOT NULL DEFAULT 'in_progress',
	"delivered_date" date,
	"report_statuses" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"sub_statuses" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"workers" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"created_at" timestamptz NOT NULL DEFAULT now(),
	"updated_at" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "work_tracking_records_status_valid" CHECK ("status" IN ('in_progress', 'completed', 'delivered')),
	CONSTRAINT "work_tracking_records_report_statuses_object" CHECK (jsonb_typeof("report_statuses") = 'object'),
	CONSTRAINT "work_tracking_records_sub_statuses_array" CHECK (jsonb_typeof("sub_statuses") = 'array'),
	CONSTRAINT "work_tracking_records_workers_object" CHECK (jsonb_typeof("workers") = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "work_tracking_records_house_round_date_unique" ON "work_tracking_records" ("house_no", "round", "event_date");
--> statement-breakpoint
CREATE INDEX "work_tracking_records_event_date_idx" ON "work_tracking_records" ("event_date");
