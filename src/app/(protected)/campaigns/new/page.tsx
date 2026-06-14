import { requireAccess } from "@/core/auth/access";
import {
  listExecutionTypes,
  listDepartments,
  listJobTitles,
  listCampaignStatuses,
} from "@/modules/org/queries";
import { listStores } from "@/modules/stores/queries";
import { CampaignForm } from "@/modules/campaigns/components/campaign-form";
import { EMPTY_CAMPAIGN } from "@/modules/campaigns/types";

export default async function NewCampaignPage() {
  await requireAccess("campaigns");
  const [executionTypes, departments, jobTitles, stores, statuses] =
    await Promise.all([
      listExecutionTypes(),
      listDepartments(),
      listJobTitles(),
      listStores(),
      listCampaignStatuses(),
    ]);

  return (
    <CampaignForm
      mode="create"
      initial={EMPTY_CAMPAIGN}
      executionTypes={executionTypes}
      departments={departments}
      jobTitles={jobTitles}
      stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
      statuses={statuses}
    />
  );
}
