import { notFound } from "next/navigation";
import { requireAccess } from "@/core/auth/access";
import {
  listExecutionTypes,
  listDepartments,
  listJobTitles,
  listCampaignStatuses,
} from "@/modules/org/queries";
import { listStores } from "@/modules/stores/queries";
import { getCampaign } from "@/modules/campaigns/queries";
import { CampaignForm } from "@/modules/campaigns/components/campaign-form";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAccess("campaigns");
  const { id } = await params;

  const [campaign, executionTypes, departments, jobTitles, stores, statuses] =
    await Promise.all([
      getCampaign(id),
      listExecutionTypes(),
      listDepartments(),
      listJobTitles(),
      listStores(),
      listCampaignStatuses(),
    ]);
  if (!campaign) notFound();

  const { id: cid, ...initial } = campaign;

  return (
    <CampaignForm
      mode="edit"
      campaignId={cid}
      initial={initial}
      executionTypes={executionTypes}
      departments={departments}
      jobTitles={jobTitles}
      stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
      statuses={statuses}
    />
  );
}
