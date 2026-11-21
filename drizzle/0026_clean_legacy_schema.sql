ALTER TABLE "employee_skills" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "salary_slip_imports" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "salary_slip_versions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "salary_slips" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skills" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "employee_skills" CASCADE;--> statement-breakpoint
DROP TABLE "salary_slip_imports" CASCADE;--> statement-breakpoint
DROP TABLE "salary_slip_versions" CASCADE;--> statement-breakpoint
DROP TABLE "salary_slips" CASCADE;--> statement-breakpoint
DROP TABLE "skills" CASCADE;--> statement-breakpoint
ALTER TABLE "employee_documents" DROP CONSTRAINT "employee_documents_storage_location_valid";--> statement-breakpoint
ALTER TABLE "employee_documents" ALTER COLUMN "drive_file_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_documents" DROP COLUMN "file_data";