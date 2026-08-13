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
/** A sku_code in the sheet that the named campaign's SKU list doesn't contain.
 * Rows carrying one are reported and excluded rather than imported blind. */
export type UnknownSku = { code: string; rowCount: number };

// All three sheets moved from weekly to daily grain in 0027: `date` replaces
// the old month + week pair. `month` is still written to the database (it is
// NOT NULL there) but is derived from the date rather than supplied.

// ---- Campaign Data ----
export type CampaignSourceRow = {
  date: string; // "YYYY-MM-DD"
  campaignName: string;
  storeName: string;
  status: string;
};
export type CampaignPreviewRow = { index: number; raw: CampaignSourceRow; storeId: string | null };
export type CampaignImportPreview = {
  rows: CampaignPreviewRow[];
  unmatchedStores: UnmatchedName[];
  unknownSkus: UnknownSku[]; // always empty — this sheet has no SKU column
  matchedCount: number;
  totalCount: number;
};

// ---- Inventory Data ----
export type InventorySourceRow = {
  date: string;
  campaignName: string;
  storeName: string;
  skuCode: string;
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
  unknownSkus: UnknownSku[];
  matchedCount: number;
  totalCount: number;
};

// ---- Sell Side Data ----
// Units are what make days of cover, rate of sale, overstock and phantom stock
// possible: stock is counted in units and GMV in rupees, so without units the
// two can never be divided into each other.
export type SellSideSourceRow = {
  date: string;
  campaignName: string;
  storeName: string;
  skuCode: string;
  skuName: string;
  thisMonthUnits: number | null;
  lastMonthUnits: number | null;
  lastYearUnits: number | null;
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
  unknownSkus: UnknownSku[];
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
