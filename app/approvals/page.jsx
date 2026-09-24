import ApprovalModule from "@/components/hrm/approvals/ApprovalModule";
import { requireRole } from "@/lib/auth/dal";

export default async function ApprovalsPage() {
  await requireRole("supervisor", "ceo");
  return <ApprovalModule />;
}
