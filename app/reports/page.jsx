import ReportsModule from "@/components/hrm/reports/ReportsModule";
import { requirePageAccess } from "@/lib/auth/dal";

export default async function ReportsPage() {
  await requirePageAccess("reports");
  return <ReportsModule />;
}
