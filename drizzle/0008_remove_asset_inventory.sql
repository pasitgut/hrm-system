UPDATE "asset_request_events" e
SET "details" = e."details" || jsonb_build_object(
	'legacyLoan', jsonb_strip_nulls(jsonb_build_object(
		'checkoutDate', l."checkout_date",
		'dueDate', l."due_date",
		'returnedAt', l."returned_at",
		'returnNote', l."return_note",
		'purpose', l."purpose",
		'originalStatusCode', l."status_code",
		'decidedByEmployeeId', l."decided_by_employee_id",
		'decidedAt', l."decided_at",
		'decisionNote', l."decision_note",
		'cancelledByEmployeeId', l."cancelled_by_employee_id",
		'cancelledAt', l."cancelled_at",
		'createdAt', l."created_at",
		'updatedAt', l."updated_at"
	))
)
FROM "asset_loans" l
WHERE e."request_id" = l."id" AND e."event_type" = 'migrated_from_asset_loan';--> statement-breakpoint
ALTER TABLE "asset_request_items" DROP CONSTRAINT "asset_request_items_asset_id_assets_id_fk";--> statement-breakpoint
DROP INDEX "asset_request_items_asset_id_idx";--> statement-breakpoint
ALTER TABLE "asset_request_items" DROP COLUMN "asset_id";--> statement-breakpoint
DROP TABLE "asset_loans";--> statement-breakpoint
DROP TABLE "assets";--> statement-breakpoint
DROP TABLE "asset_categories";--> statement-breakpoint
DROP TYPE "asset_status";
