import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otRateSettings } from "@/lib/db/schema";

export const DEFAULT_OT_RATE_SETTINGS = {
  weekdayMultiplier: 1.5,
  holidayMultiplier: 3,
};

export async function getOtRateSettings() {
  const [settings] = await db
    .select({
      weekdayMultiplier: otRateSettings.weekdayMultiplier,
      holidayMultiplier: otRateSettings.holidayMultiplier,
    })
    .from(otRateSettings)
    .where(eq(otRateSettings.id, 1))
    .limit(1);

  return settings ?? DEFAULT_OT_RATE_SETTINGS;
}
