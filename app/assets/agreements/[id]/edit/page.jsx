import AgreementTemplateEditorPage from "@/components/hrm/assets/AgreementTemplateEditorPage";
import { requirePageAccess, requirePermission } from "@/lib/auth/dal";

export default async function EditAgreementTemplatePage({ params }) {
  await requirePageAccess("assets");
  await requirePermission("assets.templates.manage");
  const { id } = await params;
  return <AgreementTemplateEditorPage templateId={id} />;
}
