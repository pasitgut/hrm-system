ALTER TABLE "employees" ALTER COLUMN "department_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "position_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "employment_status_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "employment_type_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" DROP CONSTRAINT "employees_department_id_departments_id_fk";--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "employees" DROP CONSTRAINT "employees_position_id_positions_id_fk";--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "employees" DROP CONSTRAINT "employees_employment_status_id_employment_statuses_id_fk";--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_employment_status_id_employment_statuses_id_fk" FOREIGN KEY ("employment_status_id") REFERENCES "public"."employment_statuses"("id") ON DELETE set null ON UPDATE no action DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "employees" DROP CONSTRAINT "employees_employment_type_id_employment_types_id_fk";--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_employment_type_id_employment_types_id_fk" FOREIGN KEY ("employment_type_id") REFERENCES "public"."employment_types"("id") ON DELETE set null ON UPDATE no action DEFERRABLE INITIALLY IMMEDIATE;
