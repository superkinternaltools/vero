import { requireAccess } from "@/core/auth/access";
import {
  getLeaderboardFilters,
  getJobTitleLeaderboard,
  getStoreLeaderboard,
} from "@/modules/leaderboard/queries";
import { LeaderboardClient } from "@/modules/leaderboard/components/leaderboard-client";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ job_title?: string; from?: string; to?: string; campaigns?: string }>;
}) {
  const { profile: me } = await requireAccess("leaderboard");
  const { job_title, from: rawFrom, to: rawTo, campaigns: rawCampaigns } = await searchParams;

  // Default: current calendar month
  const today = new Date();
  const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    .toISOString()
    .split("T")[0];
  const defaultTo = today.toISOString().split("T")[0];

  const dateFrom = rawFrom || defaultFrom;
  const dateTo = rawTo || defaultTo;
  const campaignIds = rawCampaigns ? rawCampaigns.split(",").filter(Boolean) : [];

  const { jobTitles, campaigns } = await getLeaderboardFilters();

  const [jtRows, storeRows] = await Promise.all([
    job_title
      ? getJobTitleLeaderboard({ jobTitleId: job_title, campaignIds, dateFrom, dateTo })
      : Promise.resolve(null),
    me.is_admin
      ? getStoreLeaderboard({ campaignIds, dateFrom, dateTo })
      : Promise.resolve([]),
  ]);

  return (
    <LeaderboardClient
      jobTitles={jobTitles}
      campaigns={campaigns}
      selectedJobTitleId={job_title ?? null}
      dateFrom={dateFrom}
      dateTo={dateTo}
      selectedCampaignIds={campaignIds}
      jtRows={jtRows}
      storeRows={storeRows}
      isAdmin={!!me.is_admin}
    />
  );
}
