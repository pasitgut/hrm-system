import AgreementDocumentEditorPage from "@/components/hrm/assets/AgreementDocumentEditorPage";
import { requirePageAccess } from "@/lib/auth/dal";

export default async function EditRequestAgreementPage({ params }) {
  await requirePageAccess("assets");
  const { id } = await params;
  return <AgreementDocumentEditorPage requestId={id} />;
}
