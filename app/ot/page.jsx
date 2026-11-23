import OTModule from "@/components/hrm/ot/OTModule";
import { requirePageAccess } from "@/lib/auth/dal";

export default async function OTPage() {
  await requirePageAccess("ot");
  return <OTModule />;
}
