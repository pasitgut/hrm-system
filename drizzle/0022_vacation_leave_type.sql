-- "ลาพักร้อน" (vacation) becomes a built-in leave type next to personal / sick / birthday: 6 days per year for everyone.

-- A type with another code but the same name would violate the unique name: keep it (leave history may use it) but retire it.
UPDATE "leave_types"
SET "name" = "name" || ' (เดิม)', "is_active" = false
WHERE "name" = 'ลาพักร้อน' AND "code" <> 'vacation';
--> statement-breakpoint

INSERT INTO "leave_types" ("code", "name", "description", "is_active", "annual_quota_days", "quota_basis")
VALUES ('vacation', 'ลาพักร้อน', NULL, true, 6, 'fixed')
ON CONFLICT ("code") DO UPDATE SET "is_active" = true;
