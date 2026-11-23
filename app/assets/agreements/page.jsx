import AgreementTemplatesPage from "@/components/hrm/assets/AgreementTemplatesPage";
import { requirePageAccess, requirePermission } from "@/lib/auth/dal";

export default async function AgreementsPage() {
  await requirePageAccess("assets");
  await requirePermission("assets.templates.manage");
  return <AgreementTemplatesPage />;
}
