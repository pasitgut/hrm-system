import ApprovalModule from "@/components/hrm/approvals/ApprovalModule";
import { requireAnyPermission } from "@/lib/auth/dal";

export default async function ApprovalsPage() {
  await requireAnyPermission("ot.approve", "leave.approve", "assets.manage");
  return <ApprovalModule />;
}
