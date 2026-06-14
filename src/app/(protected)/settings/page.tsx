import { requireAdmin } from "@/core/auth/session";
import { getSettings, getRolesWithPermissions } from "@/modules/settings/queries";
import {
  listRejectionReasons,
  listNonSubmissionReasons,
  listCampaignStatuses,
} from "@/modules/org/queries";
import { SettingsClient } from "@/modules/settings/components/settings-client";

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, rejectionReasons, nonSubmissionReasons, campaignStatuses, rolePerms] =
    await Promise.all([
      getSettings(),
      listRejectionReasons(),
      listNonSubmissionReasons(),
      listCampaignStatuses(),
      getRolesWithPermissions(),
    ]);

  return (
    <SettingsClient
      settings={settings}
      rejectionReasons={rejectionReasons}
      nonSubmissionReasons={nonSubmissionReasons}
      campaignStatuses={campaignStatuses}
      roles={rolePerms.roles}
      granted={rolePerms.granted}
    />
  );
}
