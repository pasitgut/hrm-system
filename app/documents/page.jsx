import DocumentsModule from "@/components/hrm/documents/DocumentsModule";
import { requireAnyPermission } from "@/lib/auth/dal";

export default async function DocumentsPage() {
  await requireAnyPermission("employees.documents.view", "employees.documents.manage");
  return <DocumentsModule />;
}
