import { requireAccess } from "@/core/auth/access";
import {
  listCampaignOptions,
  listAvailableMonths,
  getContestMonthReport,
  getUnclassifiedStatuses,
  getOrGenerateContestHeadline,
} from "@/modules/contest-impact/queries";
import { ensureDummyData } from "@/modules/contest-impact/seed";
import { ContestImpactTabs } from "@/modules/contest-impact/components/contest-impact-tabs";
import { ReportClient } from "@/modules/contest-impact/components/report-client";
import { StatusClassificationForm } from "@/modules/contest-impact/components/status-classification-form";

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
  const campaignLabel = campaigns.find((c) => c.key === campaignKey)?.label ?? "";

  const months = campaignKey ? await listAvailableMonths(campaignKey) : [];
  const month = sp.month && months.includes(sp.month) ? sp.month : (months[0] ?? null);

  const unclassified = campaignKey && month ? await getUnclassifiedStatuses(campaignKey, month) : [];

  if (campaignKey && month && unclassified.length > 0) {
    return (
      <div>
        <ContestImpactTabs />
        <div className="py-8">
          <StatusClassificationForm campaignKey={campaignKey} campaignLabel={campaignLabel} statuses={unclassified} />
        </div>
      </div>
    );
  }

  const report = campaignKey && month ? await getContestMonthReport(campaignKey, month) : null;
  const headline =
    report && campaignKey && month ? await getOrGenerateContestHeadline(campaignKey, campaignLabel, month, report) : null;

  return (
    <div>
      <ContestImpactTabs />
      <ReportClient campaigns={campaigns} months={months} campaignKey={campaignKey} month={month} report={report} headline={headline} />
    </div>
  );
}
