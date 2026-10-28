import WorkOverviewPage from "@/components/hrm/work-tracking/WorkOverviewPage";
import { requireAnyPermission } from "@/lib/auth/dal";

export default async function WorkTrackingPage() {
  await requireAnyPermission("work.view", "work.status.update", "work.create");
  return <WorkOverviewPage />;
}
