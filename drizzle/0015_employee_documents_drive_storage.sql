ALTER TABLE "employee_documents" ADD COLUMN "drive_file_id" text;
--> statement-breakpoint

ALTER TABLE "employee_documents" ALTER COLUMN "file_data" DROP NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX "employee_documents_drive_file_id_unique"
  ON "employee_documents" USING btree ("drive_file_id");
--> statement-breakpoint

ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_storage_location_valid"
  CHECK (("drive_file_id" IS NOT NULL AND "file_data" IS NULL) OR ("drive_file_id" IS NULL AND "file_data" IS NOT NULL));
