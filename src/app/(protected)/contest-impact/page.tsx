import { requireAccess } from "@/core/auth/access";
import { listCampaignOptions, listImportedWeeks, getContestImpactReport } from "@/modules/contest-impact/queries";
import { ContestImpactTabs } from "@/modules/contest-impact/components/contest-impact-tabs";
import { ReportClient } from "@/modules/contest-impact/components/report-client";

export default async function ContestImpactPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; month?: string; week?: string }>;
}) {
  await requireAccess("contest_impact");
  const sp = await searchParams;

  const campaigns = await listCampaignOptions();
  const campaignId =
    sp.campaign && campaigns.some((c) => c.id === sp.campaign) ? sp.campaign : (campaigns[0]?.id ?? null);

  const weeks = campaignId ? await listImportedWeeks(campaignId) : [];

  const requestedMonth = sp.month ?? null;
  const requestedWeek = sp.week ? Number(sp.week) : null;
  const requestedIsValid = weeks.some((w) => w.month === requestedMonth && w.weekOfMonth === requestedWeek);
  const month = requestedIsValid ? requestedMonth : (weeks[0]?.month ?? null);
  const weekOfMonth = requestedIsValid ? requestedWeek : (weeks[0]?.weekOfMonth ?? null);

  const report = campaignId && month && weekOfMonth ? await getContestImpactReport(campaignId, month, weekOfMonth) : null;

  return (
    <div>
      <ContestImpactTabs />
      <ReportClient
        campaigns={campaigns}
        weeks={weeks}
        selectedCampaignId={campaignId}
        selectedMonth={month}
        selectedWeek={weekOfMonth}
        report={report}
      />
    </div>
  );
}
