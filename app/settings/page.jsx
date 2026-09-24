import SettingsModule from "@/components/hrm/settings/SettingsModule";
import { requireRole } from "@/lib/auth/dal";

export default async function SettingsPage() {
  await requireRole("supervisor", "ceo");
  return <SettingsModule />;
}
