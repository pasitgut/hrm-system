import ReportsModule from "@/components/hrm/reports/ReportsModule";
import { requirePermission } from "@/lib/auth/dal";

export default async function ReportsPage() {
  await requirePermission("reports.view");
  return <ReportsModule />;
}
