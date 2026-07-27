export type GroupKey = "approved" | "configured_not_approved" | "not_configured";

export const GROUP_LABELS: Record<GroupKey, string> = {
  approved: "Approved",
  configured_not_approved: "Configured, Not Approved",
  not_configured: "Not Configured",
};

export const GROUP_ORDER: GroupKey[] = ["approved", "configured_not_approved", "not_configured"];

/** Statuses from the Campaign Data sheet that count as a successful contest run. */
export const APPROVED_STATUSES = new Set(["approved", "half approved"]);

export type NameOption = { id: string; label: string };
export type UnmatchedName = { name: string; rowCount: number };

// ---- Campaign Data ----
export type CampaignSourceRow = {
  month: string; // "YYYY-MM"
  week: number;
  campaignName: string;
  storeName: string;
  status: string;
};
export type CampaignPreviewRow = { index: number; raw: CampaignSourceRow; storeId: string | null };
export type CampaignImportPreview = {
  rows: CampaignPreviewRow[];
  unmatchedStores: UnmatchedName[];
  matchedCount: number;
  totalCount: number;
};

// ---- Inventory Data ----
export type InventorySourceRow = {
  month: string;
  week: number;
  campaignName: string;
  storeName: string;
  skuName: string;
  targetStoreStock: number | null;
  inStoreStock: number | null;
  targetWarehouseStock: number | null;
  inWarehouseStock: number | null;
};
export type InventoryPreviewRow = { index: number; raw: InventorySourceRow; storeId: string | null };
export type InventoryImportPreview = {
  rows: InventoryPreviewRow[];
  unmatchedStores: UnmatchedName[];
  matchedCount: number;
  totalCount: number;
};

// ---- Sell Side Data ----
export type SellSideSourceRow = {
  month: string;
  week: number;
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
export type SellSidePreviewRow = { index: number; raw: SellSideSourceRow; storeId: string | null };
export type SellSideImportPreview = {
  rows: SellSidePreviewRow[];
  unmatchedStores: UnmatchedName[];
  matchedCount: number;
  totalCount: number;
};

// ---- Report ----
export type WeekMetrics = {
  gmvVsLastMonth: number | null;
  gmvVsLastYear: number | null;
  penetrationVsLastMonth: number | null;
  penetrationVsLastYear: number | null;
  avgUnitVsLastMonth: number | null;
  avgUnitVsLastYear: number | null;
  categoryContributionVsLastMonth: number | null;
  categoryContributionVsLastYear: number | null;
  storeStockFillRate: number | null; // weighted, this week
  storeSkuOnTargetPct: number | null;
  warehouseStockFillRate: number | null;
  warehouseSkuOnTargetPct: number | null;
};

export type GroupSummary = { key: GroupKey; count: number; metrics: WeekMetrics };

export type StoreDetailRow = {
  storeId: string;
  storeName: string;
  status: string | null;
  gmv: number | null;
  gmvVsLastMonth: number | null;
  gmvVsLastYear: number | null;
  storeStockFillRate: number | null;
  warehouseStockFillRate: number | null;
};

export type WeekReport = {
  groups: GroupSummary[];
  detail: Record<GroupKey, StoreDetailRow[]>;
};

export type WeekTrendPoint = {
  week: number;
  counts: Record<GroupKey, number>;
  byGroup: Record<GroupKey, {
    gmvVsLastMonth: number | null;
    penetrationVsLastMonth: number | null;
    avgUnitVsLastMonth: number | null;
    categoryContributionVsLastMonth: number | null;
    storeStockFillRate: number | null;
    warehouseStockFillRate: number | null;
  }>;
};

export type MonthlyOverview = { weeks: WeekTrendPoint[] };

export type CampaignOption = { key: string; label: string };
