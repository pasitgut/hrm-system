import SettingsModule from "@/components/hrm/settings/SettingsModule";
import { requireAnyPermission } from "@/lib/auth/dal";

export default async function SettingsPage() {
  await requireAnyPermission("settings.manage", "leave_types.manage", "users.permissions.manage");
  return <SettingsModule />;
}
