import { notFound } from "next/navigation";
import { requireAccess } from "@/core/auth/access";
import { getContest, getLatestMonth } from "@/modules/brand-visibility/queries";
import { EMPTY_MONTH } from "@/modules/brand-visibility/types";
import { MonthForm } from "@/modules/brand-visibility/components/month-form";
import { listDepartments, listJobTitles, listExecutionTypes, listCampaignStatuses } from "@/modules/org/queries";
import { listStores } from "@/modules/stores/queries";

export default async function NewMonthPage({ params }: { params: Promise<{ contestId: string }> }) {
  await requireAccess("brand_visibility");
  const { contestId } = await params;

  const contest = await getContest(contestId);
  if (!contest) notFound();

  const [latest, executionTypes, departments, jobTitles, stores, statuses] = await Promise.all([
    getLatestMonth(contestId),
    listExecutionTypes(),
    listDepartments(),
    listJobTitles(),
    listStores(),
    listCampaignStatuses(),
  ]);

  return (
    <MonthForm
      mode="create"
      contestId={contest.id}
      contestName={contest.name}
      initial={latest ?? EMPTY_MONTH}
      executionTypes={executionTypes}
      departments={departments}
      jobTitles={jobTitles}
      stores={stores.map((s) => ({ id: s.id, label: s.name }))}
      statuses={statuses}
    />
  );
}
