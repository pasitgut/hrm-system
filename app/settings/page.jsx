import SettingsModule from "@/components/hrm/settings/SettingsModule";
import { requireAnyPermission } from "@/lib/auth/dal";

export default async function SettingsPage() {
  await requireAnyPermission(
    "settings.departments.manage",
    "settings.positions.manage",
    "settings.employment.manage",
    "settings.ot_rates.manage",
    "leave_types.manage",
    "users.permissions.manage",
  );
  return <SettingsModule />;
}
