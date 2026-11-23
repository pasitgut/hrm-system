CREATE TABLE IF NOT EXISTS "social_security_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_from" date NOT NULL,
	"label" varchar(120) NOT NULL,
	"employee_rate_percent" numeric(5, 2) DEFAULT 5 NOT NULL,
	"employer_rate_percent" numeric(5, 2) DEFAULT 5 NOT NULL,
	"min_wage_base" numeric(12, 2) DEFAULT 1650 NOT NULL,
	"max_wage_base" numeric(12, 2) DEFAULT 17500 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_security_rates_effective_from_unique" UNIQUE("effective_from"),
	CONSTRAINT "social_security_rates_employee_rate_valid" CHECK ("employee_rate_percent" >= 0 AND "employee_rate_percent" <= 100),
	CONSTRAINT "social_security_rates_employer_rate_valid" CHECK ("employer_rate_percent" >= 0 AND "employer_rate_percent" <= 100),
	CONSTRAINT "social_security_rates_wage_base_valid" CHECK ("min_wage_base" >= 0 AND "max_wage_base" >= "min_wage_base")
);
--> statement-breakpoint
INSERT INTO "social_security_rates" ("effective_from", "label", "employee_rate_percent", "employer_rate_percent", "min_wage_base", "max_wage_base", "note")
VALUES
	('2020-01-01', 'ฐานเพดานเดิม (พ.ศ. 2563–2568)', 5, 5, 1650, 15000, 'เพดานค่าจ้าง 15,000 บาท สูงสุด 750 บาท/เดือน'),
	('2026-01-01', 'ระยะที่ 1 (พ.ศ. 2569–2571)', 5, 5, 1650, 17500, 'กฎกระทรวง พ.ศ. 2568 ระยะที่ 1 เพดานค่าจ้าง 17,500 บาท สูงสุด 875 บาท/เดือน'),
	('2029-01-01', 'ระยะที่ 2 (พ.ศ. 2572–2574)', 5, 5, 1650, 20000, 'กฎกระทรวง พ.ศ. 2568 ระยะที่ 2 เพดานค่าจ้าง 20,000 บาท สูงสุด 1,000 บาท/เดือน'),
	('2032-01-01', 'ระยะที่ 3 (พ.ศ. 2575 เป็นต้นไป)', 5, 5, 1650, 23000, 'กฎกระทรวง พ.ศ. 2568 ระยะที่ 3 เพดานค่าจ้าง 23,000 บาท สูงสุด 1,150 บาท/เดือน')
ON CONFLICT ("effective_from") DO NOTHING;
