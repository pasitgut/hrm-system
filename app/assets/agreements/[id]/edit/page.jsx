import AgreementTemplateEditorPage from "@/components/hrm/assets/AgreementTemplateEditorPage";

export default async function EditAgreementTemplatePage({ params }) {
  const { id } = await params;
  return <AgreementTemplateEditorPage templateId={id} />;
}
