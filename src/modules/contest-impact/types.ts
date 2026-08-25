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
  /** The barcode/EAN — a stable identity independent of product name spelling. */
  skuId: string;
  productName: string;
  /** Already a 0–100 percentage on the sheet, not a raw stock count. */
  storeAvailability: number | null;
  /** Warehouse-level availability for this SKU — one shared pool, so this
   * repeats across every store's row for the same SKU/week. */
  whAvailability: number | null;
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
  thisMonthInStoreValue: number | null;
  lastMonthInStoreValue: number | null;
  lastYearInStoreValue: number | null;
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

export type SellMetricKey = "gmv" | "penetration" | "avgUnit" | "categoryContribution" | "inStoreValue" | "sellThrough" | "doh";

/** How a metric is formatted and how its growth is expressed — every metric
 * is now averaged across the stores in a group (see queries.ts `aggregate`),
 * so this only controls display: currency symbol, percent sign, a plain
 * number, or a day count, and whether a change is a percentage-point diff or
 * a percent change. */
export type MetricKind = "currency" | "percent" | "number" | "days";

export const SELL_METRICS: { key: SellMetricKey; label: string; what: string; kind: MetricKind }[] = [
  { key: "gmv", label: "Sales (GMV)", what: "Average rupee sales per store in the group.", kind: "currency" },
  { key: "penetration", label: "Customer penetration", what: "Share of footfall buying this category, averaged across stores.", kind: "percent" },
  { key: "avgUnit", label: "Avg unit", what: "Average units per bill, averaged across stores.", kind: "number" },
  { key: "categoryContribution", label: "Category contribution", what: "Category's share of total store sales, averaged across stores.", kind: "percent" },
  { key: "inStoreValue", label: "In-store value", what: "Average rupee value of stock on shelf per store, per week (a daily average across the week).", kind: "currency" },
  {
    key: "sellThrough",
    label: "Sell-through",
    what: "Formula: (GMV ÷ in-store value) × 100 — the share of that week's shelf stock that actually sold, as a %. Not a capped percentage: it can exceed 100% when stock moves fast and gets replenished mid-week.",
    kind: "percent",
  },
  {
    key: "doh",
    label: "Days of hand",
    what: "Formula: 7 × (in-store value ÷ GMV) — how many days the current shelf stock would last at that week's sales pace. The exact reciprocal of sell-through, scaled to days: a high number means slow-moving, overstocked; a low number means fast-moving.",
    kind: "days",
  },
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

/** A store's group can genuinely change week to week (approved in week 1,
 * rejected by week 4) — this carries the real per-week story, including
 * weeks with no campaign row at all (group "control" for that week only). */
export type StoreStatusWeek = { week: number; status: string | null; group: ContestGroup };

export type WeeklyGroupCounts = { week: number; approved: number; poor: number; control: number };

export type StoreRow = {
  storeId: string;
  storeName: string;
  /** The store's group as of its LATEST week only — used for sorting/filtering
   * convenience. For the full week-to-week story, use statusByWeek. */
  group: ContestGroup;
  /** One entry per week in the report (1 through however many weeks exist),
   * covering every week including ones with no campaign row for this store. */
  statusByWeek: StoreStatusWeek[];
  /** The status that decided this store's latest-week group. */
  latestStatus: string | null;
  gmv: number | null;
  gmvGrowthVsLastMonth: number | null;
  gmvGrowthVsLastYear: number | null;
  hasLastYearData: boolean;
  /** Average of this store's SKU-level store_availability rows this month — already a 0–100 percentage on the sheet. */
  storeAvailability: number | null;
  /** Average rupee value of stock on this store's shelf, per week this month. */
  inStoreValue: number | null;
  /** (gmv ÷ inStoreValue) × 100 — this store's own turnover, as a %, not capped at 100. */
  sellThrough: number | null;
  /** 7 × inStoreValue ÷ gmv — this store's own days-of-hand, the reciprocal of sellThrough in days. */
  doh: number | null;
};

/** Store availability by group, per week — control stores carry no Inventory
 * Data at all, so there's no third line. Total is every contest store
 * (approved + poor) combined, not a fourth independent group. */
export type WeeklyStockPoint = {
  week: number;
  totalStoreAvailability: number | null;
  approvedStoreAvailability: number | null;
  poorStoreAvailability: number | null;
};

/** Warehouse is one shared pool, not attributed to a store or group — a
 * single week-on-week line, not three. */
export type WeeklyWarehousePoint = { week: number; whAvailability: number | null };

export type SkuStockRow = {
  skuId: string;
  productName: string;
  approvedAvailability: number | null;
  poorAvailability: number | null;
  /** Warehouse availability for this SKU — one shared pool, not per-group, but reported alongside for context. */
  whAvailability: number | null;
};

export type StockSummary = {
  weekly: WeeklyStockPoint[];
  weeklyWarehouse: WeeklyWarehousePoint[];
  avgStoreAvailability: { total: number | null; approved: number | null; poor: number | null };
  /** A single figure — warehouse availability isn't split by group. */
  avgWhAvailability: number | null;
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
  /** Store counts as of the LATEST week only, matching the diff-in-diff math
   * above (which is anchored to that week too). For how counts shift across
   * the month, see ContestMonthReport.weeklyGroupCounts. */
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
  /** How many stores were in each group, per week — a store count isn't one
   * fixed number when groups can change week to week, so this is shown
   * instead of a single month-level count. */
  weeklyGroupCounts: WeeklyGroupCounts[];
};

/** Returned instead of a report when this campaign/month has Status values
 * that have never been classified — the report can't group stores until
 * someone decides which ones count as approved. */
export type UnclassifiedStatusesResult = {
  unclassified: string[];
};

export type CampaignOption = { key: string; label: string };

// ---- "Is it working?" diagnosis ----

/** Seven mutually-exclusive read on the month, decided by a fixed rule tree
 * in diagnosis.ts — never by the AI. "working"/"working_caveat" both mean the
 * approved-vs-control lift holds up; the "not_working_*" variants each point
 * at a different root cause and a different fix. */
export type DiagnosisVerdict =
  | "working"
  | "working_caveat"
  | "not_working_supply_store"
  | "not_working_supply_warehouse"
  | "not_working_rubric"
  | "not_working_demand"
  | "inconclusive";

/** Whether the signal behind the verdict got stronger or weaker across the
 * month — a flat "working"/"not working" hides whether it's improving. Null
 * when there isn't enough week-to-week data to say. */
export type DiagnosisTrend = "improving" | "stable" | "fading" | null;

/** Shared between the AI prompt and the UI badge, so the two never drift
 * apart into different wording for the same verdict. */
export const DIAGNOSIS_VERDICT_LABELS: Record<DiagnosisVerdict, string> = {
  working: "Working",
  working_caveat: "Working, with a caveat",
  not_working_supply_store: "Not working — store stock shortfall",
  not_working_supply_warehouse: "Not working — warehouse stock shortfall",
  not_working_rubric: "Not working — approval isn't discriminating",
  not_working_demand: "Not working — display isn't moving sales",
  inconclusive: "Inconclusive — too little data",
};

export type ContestDiagnosis = {
  verdict: DiagnosisVerdict;
  trend: DiagnosisTrend;
  /** True when fewer than half of approved stores have last-year data —
   * surfaced as a caveat rather than silently trusted, since it's also
   * exactly when a pre-existing (not campaign-caused) gap between approved
   * and control stores would be hardest to rule out. */
  selectionBiasCaveat: boolean;
  /** The specific numbers that drove the verdict — handed to the AI so it
   * narrates this exact evidence rather than inventing its own. */
  evidence: {
    incrementalValueVsLastMonth: number | null;
    incrementalPctOfBaseline: number | null;
    approvedSellThrough: number | null;
    poorSellThrough: number | null;
    approvedVsPoorSellThroughPct: number | null;
    approvedStoreAvailability: number | null;
    warehouseAvailability: number | null;
    approvedStoreCount: number;
  };
};

/** The AI's narrative for a diagnosis — never decides verdict/trend itself,
 * only explains the one the diagnosis engine already picked. rootCause is
 * empty for "working"/"working_caveat" verdicts. */
export type ContestReportNarrative = {
  verdictSentence: string;
  mechanism: string;
  rootCause: string;
};
