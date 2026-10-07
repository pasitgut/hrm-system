import LeaveModule from "@/components/hrm/leave/LeaveModule";
import { requireAnyPermission } from "@/lib/auth/dal";

export default async function LeavePage() {
  await requireAnyPermission("leave.view_self", "leave.request.self", "leave.view_company", "leave.approve", "leave.quotas.manage");
  return <LeaveModule />;
}
