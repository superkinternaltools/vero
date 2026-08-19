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
  day: string | null; // "YYYY-MM-DD", when the sheet carries a real date
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

/** Three groups, decided by campaign status rather than fixed to a bucket
 * count: "approved" ran the display and the latest status this month was
 * classified approved; "poor" ran the display but wasn't; "control" has no
 * Campaign Data row at all this month. Which raw status strings count as
 * approved is a per-campaign decision — see contest_status_classification. */
export type ContestGroup = "approved" | "poor" | "control";

export const GROUP_LABELS: Record<ContestGroup, string> = {
  approved: "Approved execution",
  poor: "Poor execution",
  control: "Control group",
};

export type GroupValues<T> = Record<ContestGroup, T>;

export type StatusClassification = { rawStatus: string; isApproved: boolean };

export type SellMetricKey = "gmv" | "penetration" | "avgUnit" | "categoryContribution";

/** How a metric is formatted and how its growth is expressed — every metric
 * is now averaged across the stores in a group (see queries.ts `aggregate`),
 * so this only controls display: currency symbol, percent sign, or a plain
 * number, and whether a change is a percentage-point diff or a percent
 * change. */
export type MetricKind = "currency" | "percent" | "number";

export const SELL_METRICS: { key: SellMetricKey; label: string; what: string; kind: MetricKind }[] = [
  { key: "gmv", label: "Sales (GMV)", what: "Average rupee sales per store in the group.", kind: "currency" },
  { key: "penetration", label: "Customer penetration", what: "Share of footfall buying this category, averaged across stores.", kind: "percent" },
  { key: "avgUnit", label: "Avg unit", what: "Average units per bill, averaged across stores.", kind: "number" },
  { key: "categoryContribution", label: "Category contribution", what: "Category's share of total store sales, averaged across stores.", kind: "percent" },
];

export type ComparisonBasis = "lastMonth" | "lastYear";

/** One week's hard number for every group, plus the growth (vs whichever
 * comparison basis) behind that number — hard number is what's shown, growth
 * is what shows up on hover. */
export type MetricWeekPoint = {
  week: number;
  value: GroupValues<number | null>;
  growthVsLastMonth: GroupValues<number | null>;
  growthVsLastYear: GroupValues<number | null>;
  n: GroupValues<number>;
};

export type MetricSeries = {
  key: SellMetricKey;
  weekly: MetricWeekPoint[];
  /** Average per store in the group (the last week's figure, since sell-side
   * rows carry a month-to-date value updated weekly) — never a sum. */
  monthAvg: GroupValues<number | null>;
  monthGrowthVsLastMonth: GroupValues<number | null>;
  monthGrowthVsLastYear: GroupValues<number | null>;
  monthN: GroupValues<number>;
};

export type StoreStatusWeek = { week: number; status: string | null };

export type StoreRow = {
  storeId: string;
  storeName: string;
  group: ContestGroup;
  /** Every status this store carried this month, one per week it has a row
   * for — shown as-is, not collapsed. */
  statusByWeek: StoreStatusWeek[];
  /** The status that decided this store's group — the latest week's status. */
  latestStatus: string | null;
  gmv: number | null;
  gmvGrowthVsLastMonth: number | null;
  gmvGrowthVsLastYear: number | null;
  hasLastYearData: boolean;
  storeStockFillRate: number | null;
  storeSkuOnTargetPct: number | null;
};

/** Daily fill rate for approved and poor-execution stores — control stores
 * carry no Inventory Data at all, so there's no third line here. */
export type DailyStockPoint = { day: string; approvedFillRate: number | null; poorFillRate: number | null };

export type WeeklyStockPoint = { week: number; approvedFillRate: number | null; poorFillRate: number | null };

export type SkuStockRow = {
  skuName: string;
  avgFillRate: number | null;
  onTargetPct: number | null;
  /** Summed store-side shortfall (target − actual, positive days only) across the month, poor-execution group only. */
  shortfallUnits: number | null;
  /** The single central warehouse reading for this SKU (it's one shared pool, not per-store). */
  warehouseUnits: number | null;
  /** warehouseUnits ÷ shortfallUnits — how many times over the warehouse could cover it. */
  coverMultiple: number | null;
};

export type StockSummary = {
  daily: DailyStockPoint[];
  weekly: WeeklyStockPoint[];
  avgFillRate: { approved: number | null; poor: number | null };
  shortfallUnitsPoor: number | null;
  warehouseUnits: number | null;
  coverMultiple: number | null;
  bySku: SkuStockRow[];
};

/** The headline number: what an average approved-group store sold beyond
 * what it would have at the control group's own month-on-month pace — a
 * simple diff-in-diff so seasonal/market movement (visible in the control
 * line) isn't credited to the campaign. All figures here are per-store
 * averages, not totals. */
export type Verdict = {
  approvedGmvThisMonth: number | null;
  approvedGmvLastMonth: number | null;
  controlGrowthVsLastMonth: number | null;
  incrementalValueVsLastMonth: number | null;
  poorGmvThisMonth: number | null;
  poorGrowthVsLastMonth: number | null;
  approvedStoreCount: number;
  poorStoreCount: number;
  controlStoreCount: number;
};

export type LastYearAvailability = {
  approvedStoresWithData: number;
  approvedStoresTotal: number;
  storeNames: string[];
};

export type ContestMonthReport = {
  verdict: Verdict;
  metrics: MetricSeries[];
  stores: StoreRow[];
  stock: StockSummary;
  lastYear: LastYearAvailability;
};

/** Returned instead of a report when this campaign/month has Status values
 * that have never been classified — the report can't group stores until
 * someone decides which ones count as approved. */
export type UnclassifiedStatusesResult = {
  unclassified: string[];
};

export type CampaignOption = { key: string; label: string };
