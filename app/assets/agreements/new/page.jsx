import AgreementTemplateEditorPage from "@/components/hrm/assets/AgreementTemplateEditorPage";
import { requirePermission } from "@/lib/auth/dal";

export default async function NewAgreementTemplatePage() {
  await requirePermission("assets.templates.manage");
  return <AgreementTemplateEditorPage />;
}
