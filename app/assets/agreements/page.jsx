import AgreementTemplatesPage from "@/components/hrm/assets/AgreementTemplatesPage";
import { requirePermission } from "@/lib/auth/dal";

export default async function AgreementsPage() {
  await requirePermission("assets.templates.manage");
  return <AgreementTemplatesPage />;
}
