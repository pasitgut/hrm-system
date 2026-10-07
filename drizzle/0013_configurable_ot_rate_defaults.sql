CREATE TABLE "ot_rate_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"weekday_multiplier" numeric(5, 2) DEFAULT 1.5 NOT NULL,
	"holiday_multiplier" numeric(5, 2) DEFAULT 3 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ot_rate_settings_single_row" CHECK ("id" = 1),
	CONSTRAINT "ot_rate_settings_weekday_multiplier_valid" CHECK ("weekday_multiplier" > 0 AND "weekday_multiplier" <= 10),
	CONSTRAINT "ot_rate_settings_holiday_multiplier_valid" CHECK ("holiday_multiplier" > 0 AND "holiday_multiplier" <= 10)
);
--> statement-breakpoint

INSERT INTO "ot_rate_settings" ("id", "weekday_multiplier", "holiday_multiplier")
VALUES (1, 1.5, 3)
ON CONFLICT ("id") DO NOTHING;
