import AssetModule from "@/components/hrm/assets/AssetModule";
import { requirePageAccess } from "@/lib/auth/dal";

export default async function AssetsPage() {
  await requirePageAccess("assets");
  return <AssetModule />;
}
