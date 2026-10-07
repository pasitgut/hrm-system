ALTER TABLE "users"
ADD COLUMN "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint

UPDATE "users"
SET "permissions" = '[
  "employees.manage",
  "ot.approve",
  "ot.view_company",
  "leave.approve",
  "leave.view_company",
  "leave_types.manage",
  "assets.manage",
  "settings.manage",
  "users.permissions.manage"
]'::jsonb
WHERE "role" IN ('supervisor', 'ceo');
--> statement-breakpoint

CREATE SEQUENCE "leave_type_code_seq";
--> statement-breakpoint

SELECT setval(
  'leave_type_code_seq',
  GREATEST(COALESCE((SELECT MAX("code"::bigint) FROM "leave_types" WHERE "code" ~ '^[0-9]+$'), 0) + 1, 1),
  false
);
--> statement-breakpoint

ALTER TABLE "leave_types"
ALTER COLUMN "code" SET DEFAULT nextval('leave_type_code_seq')::text;
--> statement-breakpoint

ALTER SEQUENCE "leave_type_code_seq" OWNED BY "leave_types"."code";
