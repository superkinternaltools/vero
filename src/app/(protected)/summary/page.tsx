import { requireAccess } from "@/core/auth/access";
import { listCampaignOptions, getCampaignMatrix } from "@/modules/summary/queries";
import { listRejectionReasons } from "@/modules/review/queries";
import { SummaryClient } from "@/modules/summary/components/summary-client";
import { SummaryTabs } from "@/modules/summary/components/summary-tabs";
import { listContests, listMonths, getRequirementForCampaign } from "@/modules/brand-visibility/queries";
import { MonthSummary } from "@/modules/brand-visibility/components/month-summary";

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; tab?: string; contest?: string; month?: string }>;
}) {
  const access = await requireAccess("summary");
  const scope = { userId: access.profile.id, isAdmin: access.isAdmin };
  const { campaign, tab, contest, month } = await searchParams;

  if (tab === "brand-visibility") {
    const [contests, rejectionReasons] = await Promise.all([listContests(), listRejectionReasons()]);
    const months = contest ? await listMonths(contest) : [];
    const matrix = month ? await getCampaignMatrix(month, scope) : null;
    const { requirement, skus } = month
      ? await getRequirementForCampaign(month)
      : { requirement: null, skus: [] };

    return (
      <div>
        <SummaryTabs active="brand-visibility" />
        <MonthSummary
          contests={contests}
          months={months}
          selectedContestId={contest ?? null}
          selectedMonthId={month ?? null}
          matrix={matrix}
          requirement={requirement}
          skus={skus}
          rejectionReasons={rejectionReasons}
        />
      </div>
    );
  }

  const [campaigns, rejectionReasons] = await Promise.all([
    listCampaignOptions(scope),
    listRejectionReasons(),
  ]);
  const matrix = campaign ? await getCampaignMatrix(campaign, scope) : null;

  return (
    <div>
      <SummaryTabs active="campaigns" />
      <SummaryClient
        campaigns={campaigns}
        selectedId={campaign ?? null}
        matrix={matrix}
        rejectionReasons={rejectionReasons}
        isAdmin={access.isAdmin}
      />
    </div>
  );
}
