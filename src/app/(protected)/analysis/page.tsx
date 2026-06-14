import { requireAccess } from "@/core/auth/access";
import { getCurrentProfile } from "@/core/auth/session";
import {
  getAnalysisOptions,
  getAnalysisThresholds,
  getOverviewData,
  getTrendSeries,
  getStoreBreakdown,
  getPersonBreakdown,
  getAiData,
} from "@/modules/analysis/queries";
import { AnalysisClient } from "@/modules/analysis/components/analysis-client";

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{
    campaigns?: string;
    from?: string;
    to?: string;
    gran?: string;
    job_title?: string;
  }>;
}) {
  await requireAccess("analysis");
  const profile = await getCurrentProfile();
  const isAdmin = profile?.is_admin ?? false;

  const sp = await searchParams;
  const campaignIds = sp.campaigns ? sp.campaigns.split(",").filter(Boolean) : [];
  const dateFrom = sp.from ?? firstOfMonth();
  const dateTo = sp.to ?? todayStr();
  const granularity = (sp.gran === "monthly" ? "monthly" : "weekly") as "weekly" | "monthly";
  const jobTitleId = sp.job_title ?? null;

  const params = { campaignIds, dateFrom, dateTo };

  const [options, thresholds, overview, trend, storeBreakdown, aiData] = await Promise.all([
    getAnalysisOptions(),
    getAnalysisThresholds(),
    getOverviewData(params),
    getTrendSeries({ ...params, granularity }),
    getStoreBreakdown(params),
    getAiData(params),
  ]);

  const personBreakdown = jobTitleId
    ? await getPersonBreakdown({ ...params, jobTitleId })
    : [];

  return (
    <AnalysisClient
      options={options}
      thresholds={thresholds}
      overview={overview}
      trend={trend}
      storeBreakdown={storeBreakdown}
      personBreakdown={personBreakdown}
      aiData={aiData}
      isAdmin={isAdmin}
      campaignIds={campaignIds}
      dateFrom={dateFrom}
      dateTo={dateTo}
      granularity={granularity}
      jobTitleId={jobTitleId}
    />
  );
}
