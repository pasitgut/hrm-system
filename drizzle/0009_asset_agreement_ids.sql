-- Give each agreement its own identity and make borrowing requests reference it.
ALTER TABLE "asset_agreements" ADD COLUMN "id" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
UPDATE "asset_agreements" SET "id" = gen_random_uuid() WHERE "id" IS NULL;--> statement-breakpoint
ALTER TABLE "asset_agreements" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "asset_requests" ADD COLUMN "agreement_id" uuid;--> statement-breakpoint
UPDATE "asset_requests" AS request
SET "agreement_id" = agreement."id"
FROM "asset_agreements" AS agreement
WHERE agreement."request_id" = request."id";--> statement-breakpoint

ALTER TABLE "asset_agreement_signers" ADD COLUMN "agreement_id" uuid;--> statement-breakpoint
UPDATE "asset_agreement_signers" AS signer
SET "agreement_id" = agreement."id"
FROM "asset_agreements" AS agreement
WHERE agreement."request_id" = signer."request_id";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "asset_agreement_signers" WHERE "agreement_id" IS NULL) THEN
    RAISE EXCEPTION 'Could not migrate every asset agreement signer to an agreement id';
  END IF;
END $$;--> statement-breakpoint

DROP INDEX "asset_agreement_signers_participant_idx";--> statement-breakpoint
ALTER TABLE "asset_agreement_signers" DROP CONSTRAINT "asset_agreement_signers_request_id_asset_agreements_request_id_fk";--> statement-breakpoint
ALTER TABLE "asset_agreement_signers" DROP CONSTRAINT "asset_agreement_signers_request_id_box_id_pk";--> statement-breakpoint
ALTER TABLE "asset_agreements" DROP CONSTRAINT "asset_agreements_request_id_asset_requests_id_fk";--> statement-breakpoint
ALTER TABLE "asset_agreements" DROP CONSTRAINT "asset_agreements_pkey";--> statement-breakpoint

ALTER TABLE "asset_agreement_signers" DROP COLUMN "request_id";--> statement-breakpoint
ALTER TABLE "asset_agreements" DROP COLUMN "request_id";--> statement-breakpoint
ALTER TABLE "asset_agreements" ADD CONSTRAINT "asset_agreements_pkey" PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_agreement_id_asset_agreements_id_fk"
  FOREIGN KEY ("agreement_id") REFERENCES "public"."asset_agreements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_agreement_signers" ALTER COLUMN "agreement_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_agreement_signers" ADD CONSTRAINT "asset_agreement_signers_agreement_id_asset_agreements_id_fk"
  FOREIGN KEY ("agreement_id") REFERENCES "public"."asset_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_agreement_signers" ADD CONSTRAINT "asset_agreement_signers_agreement_id_box_id_pk"
  PRIMARY KEY ("agreement_id", "box_id");--> statement-breakpoint

CREATE UNIQUE INDEX "asset_requests_agreement_id_unique" ON "asset_requests" USING btree ("agreement_id");--> statement-breakpoint
CREATE INDEX "asset_agreement_signers_participant_idx" ON "asset_agreement_signers" USING btree ("participant", "agreement_id");
