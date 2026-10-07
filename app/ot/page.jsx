import OTModule from "@/components/hrm/ot/OTModule";
import { requireAnyPermission } from "@/lib/auth/dal";

export default async function OTPage() {
  await requireAnyPermission("ot.view_self", "ot.request.self", "ot.view_company", "ot.approve");
  return <OTModule />;
}
