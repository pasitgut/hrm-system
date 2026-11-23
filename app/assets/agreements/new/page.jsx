import AgreementTemplateEditorPage from "@/components/hrm/assets/AgreementTemplateEditorPage";
import { requirePageAccess, requirePermission } from "@/lib/auth/dal";

export default async function NewAgreementTemplatePage() {
  await requirePageAccess("assets");
  await requirePermission("assets.templates.manage");
  return <AgreementTemplateEditorPage />;
}
