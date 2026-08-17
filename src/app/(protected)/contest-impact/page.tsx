import { requireAccess } from "@/core/auth/access";
import { listCampaignOptions, listAvailableMonths, getContestMonthReport } from "@/modules/contest-impact/queries";
import { ensureDummyData } from "@/modules/contest-impact/seed";
import { ContestImpactTabs } from "@/modules/contest-impact/components/contest-impact-tabs";
import { ReportClient } from "@/modules/contest-impact/components/report-client";

export default async function ContestImpactPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; month?: string }>;
}) {
  await requireAccess("contest_impact");
  await ensureDummyData();
  const sp = await searchParams;

  const campaigns = await listCampaignOptions();
  const campaignKey = sp.campaign && campaigns.some((c) => c.key === sp.campaign) ? sp.campaign : (campaigns[0]?.key ?? null);

  const months = campaignKey ? await listAvailableMonths(campaignKey) : [];
  const month = sp.month && months.includes(sp.month) ? sp.month : (months[0] ?? null);

  const report = campaignKey && month ? await getContestMonthReport(campaignKey, month) : null;

  return (
    <div>
      <ContestImpactTabs />
      <ReportClient campaigns={campaigns} months={months} campaignKey={campaignKey} month={month} report={report} />
    </div>
  );
}
