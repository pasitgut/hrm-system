import AdminDataModule from "@/components/hrm/settings/AdminDataModule";
import { requireAdminDataPage } from "@/lib/auth/dal";

export default async function SettingsAdminDataPage() {
  await requireAdminDataPage();
  return <AdminDataModule />;
}
