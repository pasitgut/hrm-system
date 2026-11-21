import DataMigrationModule from "@/components/hrm/settings/DataMigrationModule";
import { requirePermission } from "@/lib/auth/dal";

export default async function SettingsImportPage() {
  await requirePermission("users.permissions.manage");
  return <DataMigrationModule />;
}
