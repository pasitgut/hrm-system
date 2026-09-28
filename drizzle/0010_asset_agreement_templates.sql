-- Keep reusable Agreement templates separate from request-specific snapshots.
CREATE TYPE "asset_agreement_type" AS ENUM ('borrow', 'asset_form');--> statement-breakpoint

CREATE TABLE "asset_agreement_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" "asset_agreement_type" DEFAULT 'borrow' NOT NULL,
  "title" text NOT NULL,
  "header_html" text DEFAULT '' NOT NULL,
  "body_html" text NOT NULL,
  "footer_html" text DEFAULT '' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by_employee_id" uuid,
  "created_by_name" varchar(255) DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "asset_agreement_templates_title_not_blank" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "asset_agreement_templates_body_not_blank" CHECK (length(btrim("body_html")) > 0),
  CONSTRAINT "asset_agreement_templates_version_positive" CHECK ("version" > 0)
);--> statement-breakpoint
ALTER TABLE "asset_agreement_templates" ADD CONSTRAINT "asset_agreement_templates_created_by_employee_id_employees_id_fk"
  FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_agreement_templates_active_type_idx" ON "asset_agreement_templates" USING btree ("is_active", "type");--> statement-breakpoint

ALTER TABLE "asset_agreements" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "asset_agreements" ADD COLUMN "type" "asset_agreement_type" DEFAULT 'borrow' NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_agreements" ADD CONSTRAINT "asset_agreements_template_id_asset_agreement_templates_id_fk"
  FOREIGN KEY ("template_id") REFERENCES "public"."asset_agreement_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_requests" ADD COLUMN "borrower_signature_data" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_requests" ADD COLUMN "approved_borrow_signature_data" text DEFAULT '' NOT NULL;--> statement-breakpoint

UPDATE "asset_agreements" SET "type" = 'asset_form' WHERE lower(btrim("title")) = 'asset form';--> statement-breakpoint

-- Preserve signatures from the legacy Asset Form before removing that synthetic Agreement.
UPDATE "asset_requests" AS request
SET "borrower_signature_data" = COALESCE((
      SELECT signer."signature_data" FROM "asset_agreement_signers" AS signer
      WHERE signer."agreement_id" = request."agreement_id" AND signer."box_id" = 'employee' AND signer."signature_status" = 'signed'
    ), ''),
    "approved_borrow_signature_data" = COALESCE((
      SELECT signer."signature_data" FROM "asset_agreement_signers" AS signer
      WHERE signer."agreement_id" = request."agreement_id" AND signer."box_id" = 'admin' AND signer."signature_status" = 'signed'
    ), ''),
    "approved_borrow_by_employee_id" = COALESCE((
      SELECT signer."signed_by_employee_id" FROM "asset_agreement_signers" AS signer
      WHERE signer."agreement_id" = request."agreement_id" AND signer."box_id" = 'admin' AND signer."signature_status" = 'signed'
    ), request."approved_borrow_by_employee_id"),
    "approved_borrow_by_name" = COALESCE((
      SELECT NULLIF(signer."signed_by_name", '') FROM "asset_agreement_signers" AS signer
      WHERE signer."agreement_id" = request."agreement_id" AND signer."box_id" = 'admin' AND signer."signature_status" = 'signed'
    ), request."approved_borrow_by_name"),
    "approved_borrow_at" = COALESCE((
      SELECT signer."signed_at" FROM "asset_agreement_signers" AS signer
      WHERE signer."agreement_id" = request."agreement_id" AND signer."box_id" = 'admin' AND signer."signature_status" = 'signed'
    ), request."approved_borrow_at")
FROM "asset_agreements" AS agreement
WHERE agreement."id" = request."agreement_id" AND agreement."type" = 'asset_form';--> statement-breakpoint

-- Create a reusable starting template from an existing Agreement snapshot when one exists.
WITH source AS (
  SELECT "id", "title", "header_html", "body_html", "footer_html", "created_by_employee_id", "created_by_name"
  FROM "asset_agreements"
  WHERE "type" = 'borrow'
  ORDER BY "document_date", "id"
  LIMIT 1
), inserted AS (
  INSERT INTO "asset_agreement_templates" ("type", "title", "header_html", "body_html", "footer_html", "created_by_employee_id", "created_by_name")
  SELECT 'borrow', "title", "header_html", "body_html", "footer_html", "created_by_employee_id", "created_by_name" FROM source
  RETURNING "id", "title", "header_html", "body_html", "footer_html"
)
UPDATE "asset_agreements" AS agreement
SET "template_id" = inserted."id"
FROM inserted
WHERE agreement."type" = 'borrow'
  AND agreement."title" = inserted."title"
  AND agreement."header_html" = inserted."header_html"
  AND agreement."body_html" = inserted."body_html"
  AND agreement."footer_html" = inserted."footer_html";--> statement-breakpoint

UPDATE "asset_requests" AS request
SET "agreement_id" = NULL
FROM "asset_agreements" AS agreement
WHERE agreement."id" = request."agreement_id" AND agreement."type" = 'asset_form';--> statement-breakpoint
DELETE FROM "asset_agreements" WHERE "type" = 'asset_form';
