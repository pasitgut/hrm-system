-- OT day type (weekday/holiday) is no longer stored. It is derived on demand from the
-- date worked and employees.weekly_holidays (see lib/ot/overtime-type.ts).
ALTER TABLE "overtime_requests" DROP COLUMN "overtime_type";
