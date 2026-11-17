-- A leave type's quota can be pro-rated by length of service ("tenure") instead of being the same for everyone.
-- Only ลากิจ uses it: annual_quota_days is then the maximum, reached after 12 completed months (lib/leave/quota.ts).
ALTER TABLE "leave_types"
  ADD COLUMN "quota_basis" varchar(20) NOT NULL DEFAULT 'fixed';
--> statement-breakpoint

ALTER TABLE "leave_types"
  ADD CONSTRAINT "leave_types_quota_basis_valid" CHECK ("quota_basis" IN ('fixed', 'tenure'));
--> statement-breakpoint

-- The old default maximum of 3 becomes 6; any other value (including NULL = uncapped) was chosen by an admin and is kept.
UPDATE "leave_types"
SET "quota_basis" = 'tenure',
    "annual_quota_days" = CASE WHEN "annual_quota_days" = 3 THEN 6 ELSE "annual_quota_days" END
WHERE "code" = 'personal';
