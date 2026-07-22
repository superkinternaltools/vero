export type GroupKey = "approved" | "configured_not_approved" | "not_configured";

export const GROUP_LABELS: Record<GroupKey, string> = {
  approved: "Configured & Approved",
  configured_not_approved: "Configured, Not Approved",
  not_configured: "Not Configured",
};

/** One row of the data team's sheet, after parsing — one store × campaign × week. */
export type ImportSourceRow = {
  month: string; // "YYYY-MM"
  weekOfMonth: number;
  campaignName: string;
  storeName: string;
  thisMonthGmv: number | null;
  lastMonthGmv: number | null;
  lastYearGmv: number | null;
  thisMonthPenetration: number | null;
  lastMonthPenetration: number | null;
  lastYearPenetration: number | null;
  thisMonthAvgUnit: number | null;
  lastMonthAvgUnit: number | null;
  lastYearAvgUnit: number | null;
  thisMonthCategoryContribution: number | null;
  lastMonthCategoryContribution: number | null;
  lastYearCategoryContribution: number | null;
  inStoreValue: number | null;
};

export type ImportPreviewRow = {
  index: number;
  raw: ImportSourceRow;
  campaignId: string | null;
  storeId: string | null;
};

export type UnmatchedName = { name: string; rowCount: number };

export type ImportPreview = {
  rows: ImportPreviewRow[];
  unmatchedCampaigns: UnmatchedName[];
  unmatchedStores: UnmatchedName[];
  matchedCount: number;
  totalCount: number;
};

export type NameOption = { id: string; label: string };

export type GroupSummary = {
  key: GroupKey;
  count: number;
  medianGmvVsLastMonth: number | null;
  medianGmvVsLastYear: number | null;
  medianPenetrationVsLastMonth: number | null;
  medianPenetrationVsLastYear: number | null;
  medianAvgUnitVsLastMonth: number | null;
  medianAvgUnitVsLastYear: number | null;
  medianCategoryContributionVsLastMonth: number | null;
  medianCategoryContributionVsLastYear: number | null;
};

export type StoreDetailRow = {
  storeId: string;
  storeName: string;
  gmv: number | null;
  gmvVsLastMonth: number | null;
  gmvVsLastYear: number | null;
  penetration: number | null;
  verdictLabel: string;
};

export type ContestImpactReport = {
  groups: GroupSummary[];
  detail: Record<GroupKey, StoreDetailRow[]>;
  excludedPendingCount: number;
};

export type WeekOption = { month: string; weekOfMonth: number; label: string };

/** One row of a past-contest bulk backfill — verdict already known, no live submission. */
export type HistoricalRow = {
  campaignName: string;
  storeName: string;
  weekStart: string; // "YYYY-MM-DD"
  weekEnd: string;
  verdict: "approved" | "rejected" | "missed";
};

export type HistoricalPreviewRow = {
  index: number;
  raw: HistoricalRow;
  storeId: string | null;
  ok: boolean;
  error: string | null;
};
