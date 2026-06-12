import { requireAdmin } from "@/core/auth/session";
import { getSettings, getRolesWithPermissions } from "@/modules/settings/queries";
import {
  listRejectionReasons,
  listNonSubmissionReasons,
  listCampaignStatuses,
  listPayoutModels,
} from "@/modules/org/queries";
import { SettingsClient } from "@/modules/settings/components/settings-client";

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, rejectionReasons, nonSubmissionReasons, campaignStatuses, payoutModels, rolePerms] =
    await Promise.all([
      getSettings(),
      listRejectionReasons(),
      listNonSubmissionReasons(),
      listCampaignStatuses(),
      listPayoutModels(),
      getRolesWithPermissions(),
    ]);

  return (
    <SettingsClient
      settings={settings}
      rejectionReasons={rejectionReasons}
      nonSubmissionReasons={nonSubmissionReasons}
      campaignStatuses={campaignStatuses}
      payoutModels={payoutModels}
      roles={rolePerms.roles}
      granted={rolePerms.granted}
    />
  );
}
