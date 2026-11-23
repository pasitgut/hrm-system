import PermissionsPageModule from "@/components/hrm/settings/PermissionsPageModule";
import { requirePermission } from "@/lib/auth/dal";

export default async function SettingsPermissionsPage() {
  await requirePermission("users.permissions.manage");
  return <PermissionsPageModule />;
}
