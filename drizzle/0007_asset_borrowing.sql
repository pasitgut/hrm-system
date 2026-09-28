CREATE TYPE "asset_request_status" AS ENUM ('pending', 'approved', 'rejected', 'return_pending', 'returned', 'unknown');--> statement-breakpoint
CREATE TYPE "asset_agreement_status" AS ENUM ('waiting_handover', 'waiting_employee', 'waiting_admin', 'completed');--> statement-breakpoint
CREATE TYPE "asset_agreement_participant" AS ENUM ('employee', 'handover', 'admin');--> statement-breakpoint
CREATE TYPE "asset_signer_kind" AS ENUM ('employee', 'admin', 'other');--> statement-breakpoint
CREATE TYPE "asset_signature_status" AS ENUM ('pending', 'signed', 'locked');--> statement-breakpoint
CREATE TYPE "asset_return_condition" AS ENUM ('original', 'damaged', 'lost');--> statement-breakpoint
CREATE TYPE "asset_attachment_kind" AS ENUM ('request', 'additional', 'return');--> statement-breakpoint

CREATE TABLE "asset_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_sheet_id" text,
	"borrower_employee_id" uuid NOT NULL,
	"borrower_employee_code" varchar(20) NOT NULL,
	"borrower_name" varchar(255) NOT NULL,
	"borrower_department" varchar(255) DEFAULT '' NOT NULL,
	"borrower_position" varchar(255) DEFAULT '' NOT NULL,
	"form_date" timestamp with time zone DEFAULT now() NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date,
	"reason" text DEFAULT '' NOT NULL,
	"remarks" text DEFAULT '' NOT NULL,
	"status" "asset_request_status" DEFAULT 'pending' NOT NULL,
	"approved_borrow_by_employee_id" uuid,
	"approved_borrow_by_name" varchar(255) DEFAULT '' NOT NULL,
	"approved_borrow_at" timestamp with time zone,
	"return_inspector_employee_id" uuid,
	"return_inspector_name" varchar(255) DEFAULT '' NOT NULL,
	"approved_return_by_employee_id" uuid,
	"approved_return_by_name" varchar(255) DEFAULT '' NOT NULL,
	"return_inspection" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_employee_id" uuid,
	CONSTRAINT "asset_requests_date_order" CHECK ("to_date" IS NULL OR "to_date" >= "from_date"),
	CONSTRAINT "asset_requests_version_positive" CHECK ("version" > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX "asset_requests_legacy_sheet_id_unique" ON "asset_requests" USING btree ("legacy_sheet_id");--> statement-breakpoint
CREATE INDEX "asset_requests_borrower_created_idx" ON "asset_requests" USING btree ("borrower_employee_id", "created_at");--> statement-breakpoint
CREATE INDEX "asset_requests_status_created_idx" ON "asset_requests" USING btree ("status", "created_at");--> statement-breakpoint
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_borrower_employee_id_employees_id_fk" FOREIGN KEY ("borrower_employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_approved_borrow_by_employee_id_employees_id_fk" FOREIGN KEY ("approved_borrow_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_return_inspector_employee_id_employees_id_fk" FOREIGN KEY ("return_inspector_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_approved_return_by_employee_id_employees_id_fk" FOREIGN KEY ("approved_return_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_deleted_by_employee_id_employees_id_fk" FOREIGN KEY ("deleted_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "asset_request_items" (
	"request_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"asset_id" uuid,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "asset_request_items_position_nonnegative" CHECK ("position" >= 0),
	CONSTRAINT "asset_request_items_quantity_positive" CHECK ("quantity" > 0),
	CONSTRAINT "asset_request_items_name_not_blank" CHECK (length(btrim("name")) > 0),
	CONSTRAINT "asset_request_items_request_id_position_pk" PRIMARY KEY("request_id", "position")
);--> statement-breakpoint
ALTER TABLE "asset_request_items" ADD CONSTRAINT "asset_request_items_request_id_asset_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."asset_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_request_items" ADD CONSTRAINT "asset_request_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_request_items_asset_id_idx" ON "asset_request_items" USING btree ("asset_id");--> statement-breakpoint

CREATE TABLE "asset_request_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" "asset_attachment_kind" NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"url" text NOT NULL,
	"uploaded_by_employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_request_attachments_position_nonnegative" CHECK ("position" >= 0),
	CONSTRAINT "asset_request_attachments_url_not_blank" CHECK (length(btrim("url")) > 0),
	CONSTRAINT "asset_request_attachments_request_kind_position_unique" UNIQUE("request_id", "kind", "position")
);--> statement-breakpoint
ALTER TABLE "asset_request_attachments" ADD CONSTRAINT "asset_request_attachments_request_id_asset_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."asset_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_request_attachments" ADD CONSTRAINT "asset_request_attachments_uploaded_by_employee_id_employees_id_fk" FOREIGN KEY ("uploaded_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_request_attachments_request_kind_idx" ON "asset_request_attachments" USING btree ("request_id", "kind");--> statement-breakpoint

CREATE TABLE "asset_agreements" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"header_html" text DEFAULT '' NOT NULL,
	"body_html" text NOT NULL,
	"footer_html" text DEFAULT '' NOT NULL,
	"status" "asset_agreement_status" NOT NULL,
	"created_by_employee_id" uuid,
	"created_by_name" varchar(255) DEFAULT '' NOT NULL,
	"created_by_employee_code" varchar(20) DEFAULT '' NOT NULL,
	"return_condition" "asset_return_condition",
	"document_date" date NOT NULL,
	"updated_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "asset_agreements_version_positive" CHECK ("version" > 0)
);--> statement-breakpoint
ALTER TABLE "asset_agreements" ADD CONSTRAINT "asset_agreements_request_id_asset_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."asset_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_agreements" ADD CONSTRAINT "asset_agreements_created_by_employee_id_employees_id_fk" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "asset_agreement_signers" (
	"request_id" uuid NOT NULL,
	"box_id" varchar(100) NOT NULL,
	"position" smallint NOT NULL,
	"participant" "asset_agreement_participant" NOT NULL,
	"label" varchar(255) NOT NULL,
	"role" varchar(255) NOT NULL,
	"signer_kind" "asset_signer_kind" NOT NULL,
	"signer_name" varchar(255) DEFAULT '' NOT NULL,
	"layout_position" varchar(30) NOT NULL,
	"page" smallint,
	"x_percent" numeric(5, 2),
	"y_percent" numeric(5, 2),
	"signature_data" text,
	"signature_status" "asset_signature_status" NOT NULL,
	"signed_by_employee_id" uuid,
	"signed_by_name" varchar(255) DEFAULT '' NOT NULL,
	"signed_at" timestamp with time zone,
	"return_signature_data" text,
	"return_signed_by_employee_id" uuid,
	"return_signed_by_name" varchar(255) DEFAULT '' NOT NULL,
	"return_signed_at" timestamp with time zone,
	CONSTRAINT "asset_agreement_signers_position_nonnegative" CHECK ("position" >= 0),
	CONSTRAINT "asset_agreement_signers_page_valid" CHECK ("page" IS NULL OR "page" IN (2, 3)),
	CONSTRAINT "asset_agreement_signers_x_valid" CHECK ("x_percent" IS NULL OR "x_percent" BETWEEN 0 AND 100),
	CONSTRAINT "asset_agreement_signers_y_valid" CHECK ("y_percent" IS NULL OR "y_percent" BETWEEN 0 AND 100),
	CONSTRAINT "asset_agreement_signers_request_id_box_id_pk" PRIMARY KEY("request_id", "box_id")
);--> statement-breakpoint
ALTER TABLE "asset_agreement_signers" ADD CONSTRAINT "asset_agreement_signers_request_id_asset_agreements_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."asset_agreements"("request_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_agreement_signers" ADD CONSTRAINT "asset_agreement_signers_signed_by_employee_id_employees_id_fk" FOREIGN KEY ("signed_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_agreement_signers" ADD CONSTRAINT "asset_agreement_signers_return_signed_by_employee_id_employees_id_fk" FOREIGN KEY ("return_signed_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_agreement_signers_participant_idx" ON "asset_agreement_signers" USING btree ("participant", "request_id");--> statement-breakpoint

CREATE TABLE "asset_request_reads" (
	"request_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_request_reads_request_id_employee_id_pk" PRIMARY KEY("request_id", "employee_id")
);--> statement-breakpoint
ALTER TABLE "asset_request_reads" ADD CONSTRAINT "asset_request_reads_request_id_asset_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."asset_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_request_reads" ADD CONSTRAINT "asset_request_reads_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "asset_request_events" (
	"id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	"request_id" uuid NOT NULL,
	"actor_employee_id" uuid,
	"event_type" varchar(100) NOT NULL,
	"from_status" "asset_request_status",
	"to_status" "asset_request_status",
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_request_events_details_object" CHECK (jsonb_typeof("details") = 'object')
);--> statement-breakpoint
ALTER TABLE "asset_request_events" ADD CONSTRAINT "asset_request_events_request_id_asset_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."asset_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_request_events" ADD CONSTRAINT "asset_request_events_actor_employee_id_employees_id_fk" FOREIGN KEY ("actor_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_request_events_request_created_idx" ON "asset_request_events" USING btree ("request_id", "created_at");--> statement-breakpoint

-- Fold the existing single-asset HRM loan records into the richer request model.
INSERT INTO "asset_requests" (
	"id", "borrower_employee_id", "borrower_employee_code", "borrower_name", "borrower_department", "borrower_position",
	"form_date", "from_date", "to_date", "reason", "remarks", "status", "approved_borrow_by_employee_id",
	"approved_borrow_by_name", "approved_borrow_at", "return_inspector_name", "approved_return_by_name", "return_inspection", "created_at", "updated_at"
)
SELECT l."id", e."id", e."code", concat_ws(' ', e."first_name", e."last_name"), coalesce(d."name", ''), coalesce(p."name", ''),
	l."created_at", l."checkout_date", l."due_date", coalesce(l."purpose", ''), coalesce(l."decision_note", ''),
	CASE WHEN l."status_code" = 'approved' AND l."returned_at" IS NOT NULL THEN 'returned'::"asset_request_status"
		WHEN l."status_code" IN ('pending', 'approved', 'rejected') THEN l."status_code"::text::"asset_request_status"
		ELSE 'unknown'::"asset_request_status" END,
	l."decided_by_employee_id", coalesce(concat_ws(' ', decider."first_name", decider."last_name"), ''), l."decided_at", '', '',
	l."return_note", l."created_at", l."updated_at"
FROM "asset_loans" l
JOIN "employees" e ON e."id" = l."employee_id"
LEFT JOIN "departments" d ON d."id" = e."department_id"
LEFT JOIN "positions" p ON p."id" = e."position_id"
LEFT JOIN "employees" decider ON decider."id" = l."decided_by_employee_id"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "asset_request_items" ("request_id", "position", "asset_id", "name", "quantity", "note")
SELECT l."id", 0, l."asset_id", a."name", 1, concat_ws(' · ', nullif(a."code", ''), nullif(a."serial_number", ''))
FROM "asset_loans" l JOIN "assets" a ON a."id" = l."asset_id"
ON CONFLICT ("request_id", "position") DO NOTHING;--> statement-breakpoint
INSERT INTO "asset_request_events" ("request_id", "actor_employee_id", "event_type", "to_status", "details", "created_at")
SELECT l."id", l."employee_id", 'migrated_from_asset_loan',
	CASE WHEN l."status_code" = 'approved' AND l."returned_at" IS NOT NULL THEN 'returned'::"asset_request_status"
		WHEN l."status_code" IN ('pending', 'approved', 'rejected') THEN l."status_code"::text::"asset_request_status"
		ELSE 'unknown'::"asset_request_status" END,
	jsonb_build_object('source', 'asset_loans', 'assetId', l."asset_id"), l."created_at"
FROM "asset_loans" l
ON CONFLICT DO NOTHING;
