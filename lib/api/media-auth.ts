import {
  canCreateEmployees,
  canCreateOwnAssetRequests,
  canManageAssets,
  canManageAssetTemplates,
  canUpdateEmployeeProfiles,
} from "@/lib/auth/permissions";
import type { CloudinaryScope } from "@/lib/cloudinary";

export function canUploadMediaScope(permissions: unknown, scope: CloudinaryScope): boolean {
  if (scope === "asset" || scope === "signature") {
    return canCreateOwnAssetRequests(permissions) || canManageAssets(permissions);
  }
  if (scope === "avatar") {
    return canCreateEmployees(permissions) || canUpdateEmployeeProfiles(permissions);
  }
  return canManageAssetTemplates(permissions) || canManageAssets(permissions);
}
