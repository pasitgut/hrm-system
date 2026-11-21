import { isCloudinaryConfigured } from "@/lib/cloudinary";
import { isGoogleDriveConfigured } from "@/lib/google-drive";
import {
  INTEGRATION_METADATA,
  type IntegrationKey,
  type IntegrationStatusItem,
  type IntegrationStatusSummary,
} from "@/lib/integrations/constants";
import { isCheckerConfigured } from "@/lib/work-tracking/checker";

export {
  DEFAULT_INTEGRATION_STATUS,
  INTEGRATION_METADATA,
  type IntegrationKey,
  type IntegrationStatusItem,
  type IntegrationStatusSummary,
} from "@/lib/integrations/constants";

function buildItem(key: IntegrationKey, configured: boolean): IntegrationStatusItem {
  const meta = INTEGRATION_METADATA[key];
  return {
    key,
    name: meta.name,
    feature: meta.feature,
    configured,
  };
}

export function getIntegrationStatus(): IntegrationStatusSummary {
  const items: IntegrationStatusItem[] = [
    buildItem("googleDrive", isGoogleDriveConfigured()),
    buildItem("cloudinary", isCloudinaryConfigured()),
    buildItem("checker", isCheckerConfigured()),
  ];

  return {
    googleDrive: items[0].configured,
    cloudinary: items[1].configured,
    checker: items[2].configured,
    unconfigured: items.filter((item) => !item.configured),
  };
}
