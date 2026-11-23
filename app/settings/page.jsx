import SettingsModule from "@/components/hrm/settings/SettingsModule";
import { requirePageAccess } from "@/lib/auth/dal";

export default async function SettingsPage() {
  await requirePageAccess("settings");
  return <SettingsModule />;
}
