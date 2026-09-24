INSERT INTO "leave_types" ("code", "name", "description", "is_active", "annual_quota_days")
VALUES
	('personal', 'ลากิจ', NULL, true, 3),
	('sick', 'ลาป่วย', NULL, true, 30),
	('birthday', 'ลาวันเกิด', NULL, true, 1)
ON CONFLICT ("code") DO UPDATE SET
	"name" = EXCLUDED."name",
	"is_active" = true;
--> statement-breakpoint
UPDATE "leave_types"
SET "is_active" = false
WHERE "code" NOT IN ('personal', 'sick', 'birthday');
