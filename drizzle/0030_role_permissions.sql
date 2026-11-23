CREATE TABLE "role_permissions" (
	"role" varchar(20) PRIMARY KEY NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_valid" CHECK ("role_permissions"."role" IN ('employee', 'hr', 'executive')),
	CONSTRAINT "role_permissions_permissions_array" CHECK (jsonb_typeof("role_permissions"."permissions") = 'array')
);
--> statement-breakpoint
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "role_permissions" FROM PUBLIC;
