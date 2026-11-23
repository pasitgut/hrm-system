import WorkOverviewPage from "@/components/hrm/work-tracking/WorkOverviewPage";
import { requirePageAccess } from "@/lib/auth/dal";

export default async function WorkTrackingPage() {
  await requirePageAccess("work");
  return <WorkOverviewPage />;
}
