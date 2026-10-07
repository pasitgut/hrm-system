import AssetModule from "@/components/hrm/assets/AssetModule";
import { requireAnyPermission } from "@/lib/auth/dal";

export default async function AssetsPage() {
  await requireAnyPermission("assets.view_self", "assets.request.self", "assets.view_company", "assets.requests.manage", "assets.templates.manage");
  return <AssetModule />;
}
