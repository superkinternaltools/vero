import { requireAdmin } from "@/core/auth/session";
import { getSettings, getRolesWithPermissions } from "@/modules/settings/queries";
import {
  listRejectionReasons,
  listNonSubmissionReasons,
  listCampaignStatuses,
  listExecutionTypes,
  listCampaignCategories,
  listBrands,
} from "@/modules/org/queries";
import { SettingsClient } from "@/modules/settings/components/settings-client";

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, rejectionReasons, nonSubmissionReasons, campaignStatuses, executionTypes, campaignCategories, brands, rolePerms] =
    await Promise.all([
      getSettings(),
      listRejectionReasons(),
      listNonSubmissionReasons(),
      listCampaignStatuses(),
      listExecutionTypes(),
      listCampaignCategories(),
      listBrands(),
      getRolesWithPermissions(),
    ]);

  return (
    <SettingsClient
      settings={settings}
      rejectionReasons={rejectionReasons}
      nonSubmissionReasons={nonSubmissionReasons}
      campaignStatuses={campaignStatuses}
      executionTypes={executionTypes}
      campaignCategories={campaignCategories}
      brands={brands}
      roles={rolePerms.roles}
      granted={rolePerms.granted}
    />
  );
}
