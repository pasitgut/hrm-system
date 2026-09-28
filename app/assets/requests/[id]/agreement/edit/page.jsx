import AgreementDocumentEditorPage from "@/components/hrm/assets/AgreementDocumentEditorPage";

export default async function EditRequestAgreementPage({ params }) {
  const { id } = await params;
  return <AgreementDocumentEditorPage requestId={id} />;
}
