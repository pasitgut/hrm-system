ALTER TABLE "asset_agreements" ALTER COLUMN "created_by_employee_code" SET DATA TYPE varchar(4);--> statement-breakpoint
ALTER TABLE "asset_agreements" ALTER COLUMN "created_by_employee_code" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "asset_requests" ALTER COLUMN "borrower_employee_code" SET DATA TYPE varchar(4);--> statement-breakpoint
ALTER TABLE "work_tracking_activities" ALTER COLUMN "employee_code" SET DATA TYPE varchar(4);--> statement-breakpoint
ALTER TABLE "work_tracking_requests" ALTER COLUMN "latest_employee_code" SET DATA TYPE varchar(4);--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "attachment_url" text;--> statement-breakpoint
ALTER TABLE "asset_agreements" ADD CONSTRAINT "asset_agreements_creator_code_length_valid" CHECK ("asset_agreements"."created_by_employee_code" = '' OR char_length("asset_agreements"."created_by_employee_code") = 4);--> statement-breakpoint
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_borrower_code_length_valid" CHECK (char_length("asset_requests"."borrower_employee_code") = 4);--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_code_length_valid" CHECK (char_length("employees"."code") = 4);--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_date_order" CHECK ("employees"."end_date" IS NULL OR "employees"."end_date" >= "employees"."start_date");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_base_salary_nonnegative" CHECK ("employees"."base_salary" IS NULL OR "employees"."base_salary" >= 0);--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_work_hours_positive" CHECK ("employees"."work_hours_per_day" > 0 AND "employees"."work_hours_per_day" <= 24);--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_ot_multipliers_valid" CHECK ("employees"."ot_weekday_multiplier" > 0 AND "employees"."ot_weekday_multiplier" <= 10 AND "employees"."ot_holiday_multiplier" > 0 AND "employees"."ot_holiday_multiplier" <= 10);--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_date_order" CHECK ("leave_requests"."end_on" >= "leave_requests"."start_on");--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_session_valid" CHECK ("leave_requests"."session" IN ('full', 'am', 'pm'));--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_half_day_single_day" CHECK ("leave_requests"."session" = 'full' OR "leave_requests"."start_on" = "leave_requests"."end_on");--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_time_order" CHECK ("overtime_requests"."end_at" > "overtime_requests"."start_at");--> statement-breakpoint
ALTER TABLE "work_tracking_activities" ADD CONSTRAINT "work_tracking_activities_employee_code_length_valid" CHECK ("work_tracking_activities"."employee_code" = '' OR char_length("work_tracking_activities"."employee_code") = 4);--> statement-breakpoint
ALTER TABLE "work_tracking_requests" ADD CONSTRAINT "work_tracking_requests_employee_code_length_valid" CHECK ("work_tracking_requests"."latest_employee_code" = '' OR char_length("work_tracking_requests"."latest_employee_code") = 4);