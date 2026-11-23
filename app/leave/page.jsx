import LeaveModule from "@/components/hrm/leave/LeaveModule";
import { requirePageAccess } from "@/lib/auth/dal";

export default async function LeavePage() {
  await requirePageAccess("leave");
  return <LeaveModule />;
}
