ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE varchar(20) USING (
  CASE "role"::text
    WHEN 'supervisor' THEN 'hr'
    WHEN 'ceo' THEN 'executive'
    ELSE 'employee'
  END
);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'employee';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_valid" CHECK ("users"."role" IN ('employee', 'hr', 'executive'));--> statement-breakpoint
DROP TYPE "public"."user_role";
