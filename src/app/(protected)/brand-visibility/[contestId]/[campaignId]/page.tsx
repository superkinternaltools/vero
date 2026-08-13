import { notFound } from "next/navigation";
import { requireAccess } from "@/core/auth/access";
import { getContest, getMonthForEdit } from "@/modules/brand-visibility/queries";
import { MonthForm } from "@/modules/brand-visibility/components/month-form";
import { listDepartments, listJobTitles, listExecutionTypes, listCampaignStatuses } from "@/modules/org/queries";
import { listStores } from "@/modules/stores/queries";

export default async function EditMonthPage({
  params,
}: {
  params: Promise<{ contestId: string; campaignId: string }>;
}) {
  await requireAccess("brand_visibility");
  const { contestId, campaignId } = await params;

  const contest = await getContest(contestId);
  if (!contest) notFound();

  const [initial, executionTypes, departments, jobTitles, stores, statuses] = await Promise.all([
    getMonthForEdit(campaignId),
    listExecutionTypes(),
    listDepartments(),
    listJobTitles(),
    listStores(),
    listCampaignStatuses(),
  ]);
  if (!initial) notFound();

  return (
    <MonthForm
      mode="edit"
      contestId={contest.id}
      contestName={contest.name}
      campaignId={campaignId}
      initial={initial}
      executionTypes={executionTypes}
      departments={departments}
      jobTitles={jobTitles}
      stores={stores.map((s) => ({ id: s.id, label: s.name }))}
      statuses={statuses}
    />
  );
}
