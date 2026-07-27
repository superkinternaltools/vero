import { requireAccess } from "@/core/auth/access";
import { listCampaignOptions, listAvailableWeeks, getMonthlyOverview, getWeekReport } from "@/modules/contest-impact/queries";
import { ensureDummyData } from "@/modules/contest-impact/seed";
import { ContestImpactTabs } from "@/modules/contest-impact/components/contest-impact-tabs";
import { ReportClient } from "@/modules/contest-impact/components/report-client";

export default async function ContestImpactPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; month?: string; week?: string }>;
}) {
  await requireAccess("contest_impact");
  await ensureDummyData();
  const sp = await searchParams;

  const campaigns = await listCampaignOptions();
  const campaignKey = sp.campaign && campaigns.some((c) => c.key === sp.campaign) ? sp.campaign : (campaigns[0]?.key ?? null);

  const weeksAvail = campaignKey ? await listAvailableWeeks(campaignKey) : [];
  const months = [...new Set(weeksAvail.map((w) => w.month))].sort((a, b) => (a < b ? 1 : -1));
  const month = sp.month && months.includes(sp.month) ? sp.month : (months[0] ?? null);

  const requestedWeek = sp.week ? Number(sp.week) : null;
  const weekValid = !!requestedWeek && weeksAvail.some((w) => w.month === month && w.week === requestedWeek);
  const week = weekValid ? requestedWeek : null;

  const overview = campaignKey && month ? await getMonthlyOverview(campaignKey, month) : null;
  const weekReport = campaignKey && month && week ? await getWeekReport(campaignKey, month, week) : null;

  return (
    <div>
      <ContestImpactTabs />
      <ReportClient
        campaigns={campaigns}
        months={months}
        campaignKey={campaignKey}
        month={month}
        week={week}
        overview={overview}
        weekReport={weekReport}
      />
    </div>
  );
}
