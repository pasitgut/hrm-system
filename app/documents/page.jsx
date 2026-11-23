import DocumentsModule from "@/components/hrm/documents/DocumentsModule";
import { requirePageAccess } from "@/lib/auth/dal";

export default async function DocumentsPage() {
  await requirePageAccess("documents");
  return <DocumentsModule />;
}
