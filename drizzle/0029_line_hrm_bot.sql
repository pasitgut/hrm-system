CREATE TABLE "line_bot_states" (
	"line_uid" varchar(64) PRIMARY KEY NOT NULL,
	"step" text DEFAULT 'idle' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_event_at" bigint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() NOT NULL,
	"link_attempts" integer DEFAULT 0 NOT NULL,
	"link_window_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_request_id" uuid,
	"title" text NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"start_on" date,
	"end_on" date,
	"location" text,
	"google_event_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "line_calendar_events_leave_request_id_unique" UNIQUE("leave_request_id")
);
--> statement-breakpoint
CREATE TABLE "line_integration_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_key" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" uuid,
	"retry_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "line_integration_jobs_operation_key_unique" UNIQUE("operation_key")
);
--> statement-breakpoint
CREATE TABLE "line_link_codes" (
	"employee_id" uuid PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "line_link_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "line_webhook_events" ADD COLUMN "request_payload" jsonb;--> statement-breakpoint
ALTER TABLE "line_calendar_events" ADD CONSTRAINT "line_calendar_events_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_calendar_events" ADD CONSTRAINT "line_calendar_events_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_link_codes" ADD CONSTRAINT "line_link_codes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "line_integration_jobs_pending_idx" ON "line_integration_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "line_bot_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "line_calendar_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "line_integration_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "line_link_codes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "line_bot_states", "line_calendar_events", "line_integration_jobs", "line_link_codes" FROM PUBLIC;