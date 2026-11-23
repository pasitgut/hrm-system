import DataMigrationModule from "@/components/hrm/settings/DataMigrationModule";
import { requirePageAccess } from "@/lib/auth/dal";

export default async function SettingsImportPage() {
  await requirePageAccess("import");
  return <DataMigrationModule />;
}
