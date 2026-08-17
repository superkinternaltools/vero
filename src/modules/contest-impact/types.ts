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

/** A store is "contest" if it has any row at all in Campaign Data this
 * month — whatever Status that row carries. "control" means it sold Tide
 * products (it has Sell Side or Inventory rows) but never ran the display,
 * which is what makes it a usable comparison group rather than a gap in
 * the data. */
export type ContestGroup = "contest" | "control";

export const CONTEST_GROUP_LABELS: Record<ContestGroup, string> = {
  contest: "Contest stores",
  control: "Control stores",
};

export type SellMetricKey = "gmv" | "penetration" | "avgUnit" | "categoryContribution";

export const SELL_METRICS: { key: SellMetricKey; label: string }[] = [
  { key: "gmv", label: "GMV" },
  { key: "penetration", label: "Customer penetration" },
  { key: "avgUnit", label: "Avg unit" },
  { key: "categoryContribution", label: "Category contribution" },
];

/** A single growth comparison, contest vs control, with the observation
 * counts every figure needs to be read against — n=2 and n=190 do not carry
 * the same weight even when they produce a similarly-sized percentage. */
export type GrowthStat = {
  contest: number | null;
  control: number | null;
  gapPct: number | null;
  contestN: number;
  controlN: number;
};

export type MetricComparison = Record<SellMetricKey, { vsLastMonth: GrowthStat; vsLastYear: GrowthStat }>;

export type WeekSales = { week: number; metrics: MetricComparison };

export type StoreStatusWeek = { week: number; status: string | null };

export type StoreRow = {
  storeId: string;
  storeName: string;
  group: ContestGroup;
  /** Every status this store carried this month, one per week it has a row
   * for — shown as-is, not collapsed into "approved"/"not approved". */
  statusByWeek: StoreStatusWeek[];
  gmv: number | null;
  gmvGrowthVsLastMonth: number | null;
  gmvGrowthVsLastYear: number | null;
  hasLastYearData: boolean;
  storeStockFillRate: number | null;
  storeSkuOnTargetPct: number | null;
};

export type DailyStockPoint = { day: string; fillRate: number | null };

export type SkuStockRow = {
  skuName: string;
  avgFillRate: number | null;
  onTargetPct: number | null;
  /** Summed store-side shortfall (target − actual, positive days only) across the month. */
  shortfallUnits: number | null;
  /** The single central warehouse reading for this SKU (it's one shared pool, not per-store). */
  warehouseUnits: number | null;
  /** warehouseUnits ÷ shortfallUnits — how many times over the warehouse could cover it. */
  coverMultiple: number | null;
};

export type Verdict = {
  contestGmvGrowth: number | null;
  controlGmvGrowth: number | null;
  gapPct: number | null;
  week1ContestGmvGrowth: number | null;
  week1ControlGmvGrowth: number | null;
  contestStoreCount: number;
  controlStoreCount: number;
};

export type LastYearAvailability = {
  contestStoresWithData: number;
  contestStoresTotal: number;
  storeNames: string[];
};

export type ContestMonthReport = {
  verdict: Verdict;
  weeklySales: WeekSales[];
  pooledSales: MetricComparison;
  stores: StoreRow[];
  dailyStock: DailyStockPoint[];
  skuStock: SkuStockRow[];
  lastYear: LastYearAvailability;
};

export type CampaignOption = { key: string; label: string };
