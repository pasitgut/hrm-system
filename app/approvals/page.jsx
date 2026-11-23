import ApprovalModule from "@/components/hrm/approvals/ApprovalModule";
import { requirePageAccess } from "@/lib/auth/dal";

export default async function ApprovalsPage() {
  await requirePageAccess("approvals");
  return <ApprovalModule />;
}
