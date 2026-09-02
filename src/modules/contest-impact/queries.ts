import { createClient } from "@/core/db/server";
import { diagnoseContest } from "./diagnosis";
import { computeReportFingerprint, generateContestReportNarrative } from "./report-ai";
import { SELL_METRICS } from "./types";
import type {
  ContestDiagnosis,
  ContestReportNarrative,
  NameOption,
  CampaignOption,
  ContestGroup,
  ContestMonthReport,
  GroupValues,
  MetricKind,
  MetricSeries,
  MetricWeekPoint,
  SellMetricKey,
  SkuStockRow,
  StoreRow,
  StoreStatusWeek,
  WeeklyStockPoint,
  WeeklyWarehousePoint,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Supabase/PostgREST caps an unpaginated select at 1000 rows — silently,
 * with no error. Any query over a table that can grow past that (campaign
 * rows especially, once a few Vero syncs land) must page through with
 * .range() or it'll quietly drop rows instead of failing loudly. */
async function fetchAllRows<T = any>(queryFactory: (offset: number, limit: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  const batchSize = 1000;
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await queryFactory(offset, batchSize);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < batchSize) break;
  }
  return out;
}

/** The exact set of literal raw_campaign_name spellings (across all three
 * source tables, for this month) that this campaign's normalizeName-based
 * key resolves to. A cheap single-column pass so the real per-table fetch
 * in getContestMonthReport can filter server-side with .in(...) instead of
 * pulling every OTHER campaign's rows for the month too — without changing
 * which rows count as "this campaign", since that's still decided by the
 * same normalizeName comparison used everywhere else. */
async function listMatchingNameVariants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tables: string[],
  monthDate: string,
  campaignKey: string,
): Promise<string[]> {
  const perTable = await Promise.all(
    tables.map((table) =>
      fetchAllRows<{ raw_campaign_name: string }>((offset, limit) =>
        supabase.from(table).select("raw_campaign_name").eq("month", monthDate).range(offset, offset + limit - 1),
      ),
    ),
  );
  const variants = new Set<string>();
  for (const rows of perTable) for (const r of rows) if (normalizeName(r.raw_campaign_name) === campaignKey) variants.add(r.raw_campaign_name);
  return [...variants];
}

export async function listStoreOptions(): Promise<NameOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("stores").select("id, name").is("deleted_at", null).order("name", { ascending: true });
  return ((data as any[]) ?? []).map((s) => ({ id: s.id, label: s.name }));
}

export async function buildStoreResolver(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const [{ data: stores }, { data: aliases }] = await Promise.all([
    supabase.from("stores").select("id, name").is("deleted_at", null),
    supabase.from("store_name_aliases").select("raw_name, store_id"),
  ]);
  const byName = new Map<string, string>();
  for (const s of (stores as any[]) ?? []) byName.set(normalizeName(s.name), s.id);
  for (const a of (aliases as any[]) ?? []) byName.set(normalizeName(a.raw_name), a.store_id);
  return byName;
}

export async function listCampaignOptions(): Promise<CampaignOption[]> {
  const supabase = await createClient();
  const data = await fetchAllRows<{ raw_campaign_name: string }>((offset, limit) =>
    supabase.from("contest_campaign_rows").select("raw_campaign_name").range(offset, offset + limit - 1),
  );
  const seen = new Map<string, string>();
  for (const r of data) {
    const key = normalizeName(r.raw_campaign_name);
    if (!seen.has(key)) seen.set(key, r.raw_campaign_name.trim());
  }
  return [...seen.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function listAvailableMonths(campaignKey: string): Promise<string[]> {
  const supabase = await createClient();
  const [c, i, s] = await Promise.all([
    fetchAllRows<{ month: string; raw_campaign_name: string }>((offset, limit) =>
      supabase.from("contest_campaign_rows").select("month, raw_campaign_name").range(offset, offset + limit - 1),
    ),
    fetchAllRows<{ month: string; raw_campaign_name: string }>((offset, limit) =>
      supabase.from("contest_inventory_rows").select("month, raw_campaign_name").range(offset, offset + limit - 1),
    ),
    fetchAllRows<{ month: string; raw_campaign_name: string }>((offset, limit) =>
      supabase.from("contest_sell_side_rows").select("month, raw_campaign_name").range(offset, offset + limit - 1),
    ),
  ]);
  const all = [...c, ...i, ...s];
  const months = new Set<string>();
  for (const r of all) {
    if (normalizeName(r.raw_campaign_name) !== campaignKey) continue;
    months.add(r.month.slice(0, 7));
  }
  return [...months].sort((a, b) => (a < b ? 1 : -1));
}

export async function hasAnyContestData(): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase.from("contest_data_batches").select("id", { count: "exact", head: true });
  return (count ?? 0) > 0;
}

// ==================== status classification ====================

/** Distinct raw Status strings this campaign/month has that aren't yet
 * classified as approved/not-approved. Non-empty means the report can't
 * group stores yet — the caller should show a classification form instead. */
export async function getUnclassifiedStatuses(campaignKey: string, month: string): Promise<string[]> {
  const supabase = await createClient();
  const monthDate = `${month}-01`;

  const [rows, { data: classified }] = await Promise.all([
    fetchAllRows<{ raw_campaign_name: string; status: string }>((offset, limit) =>
      supabase.from("contest_campaign_rows").select("raw_campaign_name, status").eq("month", monthDate).range(offset, offset + limit - 1),
    ),
    supabase.from("contest_status_classification").select("raw_status").eq("campaign_key", campaignKey),
  ]);

  const known = new Set(((classified as any[]) ?? []).map((c) => c.raw_status));
  const seen = new Set<string>();
  for (const r of rows) {
    if (normalizeName(r.raw_campaign_name) !== campaignKey) continue;
    const status = (r.status as string)?.trim();
    if (status && !known.has(status)) seen.add(status);
  }
  return [...seen].sort();
}

async function getStatusApprovalMap(campaignKey: string): Promise<Map<string, boolean>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contest_status_classification")
    .select("raw_status, is_approved")
    .eq("campaign_key", campaignKey);
  const map = new Map<string, boolean>();
  for (const r of (data as any[]) ?? []) map.set(r.raw_status, r.is_approved);
  return map;
}

// ==================== Vero campaign sync ====================
// Campaign Data can also be pulled straight from a real Vero campaign's own
// tasks + submissions instead of a CSV — this stays additive to the CSV path,
// not a replacement.

export type VeroCampaignOption = { id: string; name: string };

export async function listVeroCampaigns(): Promise<VeroCampaignOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("id, name").is("deleted_at", null).order("name");
  return ((data as any[]) ?? []).map((c) => ({ id: c.id, name: c.name }));
}

/** Same week-of-month bucketing Vero's own Summary page already uses, so the
 * numbers here match what the ops team sees there. */
function weekOfDay(day: number): number {
  return day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
}

export type VeroCampaignSyncRow = { week: number; storeId: string; storeName: string; status: string };
export type VeroCampaignSyncPreview = {
  campaignName: string;
  rows: VeroCampaignSyncRow[];
  statuses: { status: string; isApproved: boolean | null }[];
};

/** Reads a campaign's reviewed submissions for one month and shapes them
 * exactly like a Campaign Data CSV row. A task with no reviewed submission
 * (still pending, not_done, missed) contributes no row for that store/week —
 * same as a CSV simply not having a line for it. */
export async function getVeroCampaignSyncPreview(campaignId: string, month: string): Promise<VeroCampaignSyncPreview> {
  const supabase = await createClient();
  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const monthEnd = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;

  const { data: campaign } = await supabase.from("campaigns").select("name").eq("id", campaignId).single();
  const campaignName = (campaign as any)?.name ?? "Unknown campaign";

  const tasks: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, store_id, due_date, stores ( name )")
      .eq("campaign_id", campaignId)
      .gte("due_date", monthStart)
      .lte("due_date", monthEnd)
      .range(offset, offset + 999);
    if (error) throw error;
    tasks.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const { data: submissionRows } = await supabase
    .from("submissions")
    .select("task_id, payout_tier_label, human_verdict")
    .eq("campaign_id", campaignId);
  const submissionByTask = new Map<string, any>();
  for (const s of (submissionRows as any[]) ?? []) submissionByTask.set(s.task_id, s);

  const rows: VeroCampaignSyncRow[] = [];
  for (const t of tasks) {
    const submission = submissionByTask.get(t.id);
    const status: string | null = submission?.payout_tier_label?.trim() || submission?.human_verdict?.trim() || null;
    if (!status) continue;
    const day = Number((t.due_date as string).split("-")[2]);
    rows.push({
      week: weekOfDay(day),
      storeId: t.store_id,
      storeName: t.stores?.name ?? "Unknown store",
      status,
    });
  }

  const campaignKey = normalizeName(campaignName);
  const approvalMap = await getStatusApprovalMap(campaignKey);
  const distinctStatuses = [...new Set(rows.map((r) => r.status))].sort();
  const statuses = distinctStatuses.map((status) => ({ status, isApproved: approvalMap.get(status) ?? null }));

  return { campaignName, rows, statuses };
}

// ==================== report ====================

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Mean of a set of already-computed availability percentages, clamped to
 * 0–100 — the sheet supplies store/warehouse availability directly, so this
 * never touches a raw stock count. */
function avgPercent(values: number[]): number | null {
  if (!values.length) return null;
  return Math.min(100, Math.max(0, sum(values) / values.length));
}

/** Rolls a metric's per-store values up to a group figure — always the MEAN
 * across stores in the group, never a sum. A raw sum would make a 195-store
 * control group look enormous next to a 12-store approved group; averaging
 * per store is what makes the groups comparable. */
function aggregate(values: number[]): number | null {
  if (!values.length) return null;
  return sum(values) / values.length;
}

/** Percentage-point difference for a rate that's already a percentage
 * (penetration, category contribution) — "+7.2pp" reads correctly there,
 * where "% growth of a percentage" wouldn't. Everything else gets ordinary
 * percent change. */
function growthFor(thisVal: number | null, lastVal: number | null, kind: MetricKind): number | null {
  if (thisVal == null || lastVal == null) return null;
  if (kind === "percent") return thisVal - lastVal;
  if (lastVal === 0) return null;
  return ((thisVal - lastVal) / Math.abs(lastVal)) * 100;
}

/** Metrics read straight off a sell-side column — sellThrough and doh are
 * deliberately NOT here, since they're ratios derived from two of these, not
 * a column of their own (see the sell-through/doh block in getContestMonthReport). */
const DIRECT_FIELD_BY_METRIC: Record<Exclude<SellMetricKey, "sellThrough" | "doh">, { this: string; lastMonth: string; lastYear: string }> = {
  gmv: { this: "this_month_gmv", lastMonth: "last_month_gmv", lastYear: "last_year_gmv" },
  penetration: { this: "this_month_penetration", lastMonth: "last_month_penetration", lastYear: "last_year_penetration" },
  avgUnit: { this: "this_month_avg_unit", lastMonth: "last_month_avg_unit", lastYear: "last_year_avg_unit" },
  categoryContribution: {
    this: "this_month_category_contribution",
    lastMonth: "last_month_category_contribution",
    lastYear: "last_year_category_contribution",
  },
  inStoreValue: { this: "this_month_in_store_value", lastMonth: "last_month_in_store_value", lastYear: "last_year_in_store_value" },
};

const GROUPS: ContestGroup[] = ["approved", "poor", "control"];

/** "Month" is the average across the weeks we have data for — never a sum.
 * GMV and in-store value are flows/levels where summing would break a later
 * ratio (sell-through); the rate metrics would double-count a re-measured
 * week if summed. Averaging is correct for all of them. */
function avgAcrossWeeks(weekly: MetricWeekPoint[], pick: (w: MetricWeekPoint) => GroupValues<number | null>): GroupValues<number | null> {
  const out = emptyGroupValues<number | null>(null);
  for (const g of GROUPS) out[g] = aggregate(weekly.map((w) => pick(w)[g]).filter((v): v is number => v != null));
  return out;
}

/** Observation counts genuinely accumulate — 8 store-weeks in week 1 plus 8
 * in week 2 really is 16 observations — so this sums, unlike the value itself. */
function sumWeeklyN(weekly: MetricWeekPoint[]): GroupValues<number> {
  const out = emptyGroupValues<number>(0);
  for (const g of GROUPS) out[g] = weekly.reduce((acc, w) => acc + w.n[g], 0);
  return out;
}

function emptyGroupValues<T>(fill: T): GroupValues<T> {
  return { approved: fill, poor: fill, control: fill };
}

/** A store with no opened_at has always existed; one with no closed_at is
 * still active — both null means "no constraint" so stores nobody has dated
 * yet aren't wrongly excluded. Plain string compare works because both
 * fields and monthStart/monthEnd are ISO "YYYY-MM-DD". */
function isActiveDuringMonth(info: { opened_at: string | null; closed_at: string | null } | undefined, monthStart: string, monthEnd: string): boolean {
  if (!info) return true;
  if (info.opened_at && info.opened_at > monthEnd) return false;
  if (info.closed_at && info.closed_at < monthStart) return false;
  return true;
}

export async function getContestMonthReport(campaignKey: string, month: string): Promise<ContestMonthReport> {
  const supabase = await createClient();
  const monthDate = `${month}-01`;
  const [monthYear, monthNum] = month.split("-").map(Number);
  const monthStart = monthDate;
  const monthEnd = `${month}-${String(new Date(Date.UTC(monthYear, monthNum, 0)).getUTCDate()).padStart(2, "0")}`;
  const matchesCampaign = (name: string) => normalizeName(name) === campaignKey;

  const statusApproval = await getStatusApprovalMap(campaignKey);

  // Narrow to this campaign's own literal name spellings for this month
  // BEFORE the real (select *) fetch, so we don't pull every other
  // campaign's rows for the month over the wire just to discard them below.
  // matchesCampaign (same normalizeName comparison) still does the actual
  // filtering afterward — this is a fetch-size optimization, not a new
  // source of truth for "which rows belong to this campaign".
  const nameVariants = await listMatchingNameVariants(
    supabase,
    ["contest_campaign_rows", "contest_inventory_rows", "contest_sell_side_rows"],
    monthDate,
    campaignKey,
  );

  // Fetch in batches to bypass Supabase's 1000-row default page limit.
  const fetchAll = async (table: string, batchSize: number) => {
    if (!nameVariants.length) return [];
    const out: any[] = [];
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("month", monthDate)
        .in("raw_campaign_name", nameVariants)
        .range(offset, offset + batchSize - 1);
      if (error) throw error;
      out.push(...(data ?? []));
      if (!data || data.length < batchSize) break;
    }
    return out;
  };

  const [campaignRowsRaw, inventoryRowsRaw, sellRowsRaw, storesRaw] = await Promise.all([
    fetchAll("contest_campaign_rows", 1000),
    fetchAll("contest_inventory_rows", 1000),
    fetchAll("contest_sell_side_rows", 1000),
    supabase.from("stores").select("id, name, opened_at, closed_at").then((r) => r.data ?? []),
  ]);

  const storeInfoById = new Map<string, { name: string; opened_at: string | null; closed_at: string | null }>();
  for (const s of storesRaw as any[]) storeInfoById.set(s.id, { name: s.name, opened_at: s.opened_at, closed_at: s.closed_at });

  const campaignAll = (campaignRowsRaw as any[]).filter((r) => r.store_id && matchesCampaign(r.raw_campaign_name));
  const inventoryAll = (inventoryRowsRaw as any[]).filter((r) => r.store_id && matchesCampaign(r.raw_campaign_name));

  // Penetration and category contribution are stored as raw fractions
  // (0.0306) straight from the sheet, not percentages (3.06) — scaled here,
  // once, so every downstream aggregate/growth/format treats them the same
  // way it treats a metric that's already 0–100. Both are shares of
  // something (footfall, sales) and can't legitimately be negative, so a
  // bad source value is floored at 0 rather than shown as e.g. "-2.3%".
  const PERCENT_FIELDS = [
    "this_month_penetration", "last_month_penetration", "last_year_penetration",
    "this_month_category_contribution", "last_month_category_contribution", "last_year_category_contribution",
  ] as const;
  const sellAll = (sellRowsRaw as any[])
    .filter((r) => r.store_id && matchesCampaign(r.raw_campaign_name))
    .map((r) => {
      const scaled = { ...r };
      for (const f of PERCENT_FIELDS) if (scaled[f] != null) scaled[f] = Math.max(0, scaled[f] * 100);
      return scaled;
    });

  // ---- group every store by its latest-week status this month ----
  const statusByStore = new Map<string, { week: number; status: string }[]>();
  for (const r of campaignAll) {
    const list = statusByStore.get(r.store_id) ?? [];
    list.push({ week: r.week, status: r.status });
    statusByStore.set(r.store_id, list);
  }

  const latestStatusByStore = new Map<string, string | null>();
  for (const [storeId, weeks] of statusByStore) {
    const sorted = [...weeks].sort((a, b) => a.week - b.week);
    latestStatusByStore.set(storeId, sorted[sorted.length - 1]?.status ?? null);
  }

  const approvedOrPoorIds = new Set(statusByStore.keys());

  /** A store's group as of its LATEST week — used only for sorting/filtering
   * convenience and for the diff-in-diff verdict math (already anchored to
   * the latest week). Everything that buckets a specific week's data uses
   * groupOfWeek below instead, since a store's group can change week to week. */
  const groupOf = (storeId: string): ContestGroup => {
    const status = latestStatusByStore.get(storeId);
    if (status == null) return "control";
    return statusApproval.get(status.trim()) ? "approved" : "poor";
  };

  /** A store's group for ONE specific week — "control" if it has no campaign
   * row that week (whether it never ran the display, or simply hadn't
   * started yet), otherwise classified from that week's own status. This is
   * what every weekly aggregate should bucket by, not the month-level group. */
  const groupOfWeek = (storeId: string, week: number): ContestGroup => {
    const status = statusByStore.get(storeId)?.find((w) => w.week === week)?.status;
    if (status == null) return "control";
    return statusApproval.get(status.trim()) ? "approved" : "poor";
  };

  // ---- control group is only stores that (a) never ran the campaign, (b)
  // were actually open during this month, and (c) have real GMV data for
  // it — a closed store or one with no sell-side row isn't a valid "did
  // nothing" baseline, it's just missing data. ----
  const sellByStoreAll = new Map<string, any[]>();
  for (const r of sellAll) {
    const list = sellByStoreAll.get(r.store_id) ?? [];
    list.push(r);
    sellByStoreAll.set(r.store_id, list);
  }

  const controlCandidateIds = new Set<string>(
    [...inventoryAll.map((r) => r.store_id), ...sellAll.map((r) => r.store_id)].filter((id) => !approvedOrPoorIds.has(id)),
  );
  const validControlIds = new Set(
    [...controlCandidateIds].filter((id) => {
      if (!isActiveDuringMonth(storeInfoById.get(id), monthStart, monthEnd)) return false;
      const rows = sellByStoreAll.get(id) ?? [];
      return rows.some((r) => r.this_month_gmv != null);
    }),
  );

  const allStoreIds = new Set<string>([...approvedOrPoorIds, ...validControlIds]);
  const inventory = inventoryAll.filter((r) => allStoreIds.has(r.store_id));
  const sell = sellAll.filter((r) => allStoreIds.has(r.store_id));
  const storeNames = new Map<string, string>([...allStoreIds].map((id) => [id, storeInfoById.get(id)?.name ?? "Unknown store"]));

  // ---- sell-side metrics: hard-number group averages per week ----
  const weeks = [...new Set(sell.map((r) => r.week))].sort((a, b) => a - b);

  const directMetrics: MetricSeries[] = (Object.keys(DIRECT_FIELD_BY_METRIC) as Exclude<SellMetricKey, "sellThrough" | "doh">[]).map((key) => {
    const fields = DIRECT_FIELD_BY_METRIC[key];
    const kind = SELL_METRICS.find((m) => m.key === key)!.kind;

    const weekly: MetricWeekPoint[] = weeks.map((week) => {
      const rowsThisWeek = sell.filter((r) => r.week === week);
      const value = emptyGroupValues<number | null>(null);
      const growthVsLastMonth = emptyGroupValues<number | null>(null);
      const growthVsLastYear = emptyGroupValues<number | null>(null);
      const n = emptyGroupValues<number>(0);

      for (const g of GROUPS) {
        const rowsInGroup = rowsThisWeek.filter((r) => groupOfWeek(r.store_id, week) === g);
        const thisVals = rowsInGroup.map((r) => r[fields.this]).filter((v): v is number => v != null);
        const lmVals = rowsInGroup.map((r) => r[fields.lastMonth]).filter((v): v is number => v != null);
        const lyVals = rowsInGroup.map((r) => r[fields.lastYear]).filter((v): v is number => v != null);

        const thisAgg = aggregate(thisVals);
        const lmAgg = aggregate(lmVals);
        const lyAgg = aggregate(lyVals);

        value[g] = thisAgg;
        growthVsLastMonth[g] = growthFor(thisAgg, lmAgg, kind);
        growthVsLastYear[g] = growthFor(thisAgg, lyAgg, kind);
        n[g] = thisVals.length;
      }

      return { week, value, growthVsLastMonth, growthVsLastYear, n };
    });

    return {
      key,
      weekly,
      monthAvg: avgAcrossWeeks(weekly, (w) => w.value),
      monthGrowthVsLastMonth: avgAcrossWeeks(weekly, (w) => w.growthVsLastMonth),
      monthGrowthVsLastYear: avgAcrossWeeks(weekly, (w) => w.growthVsLastYear),
      monthN: sumWeeklyN(weekly),
    };
  });

  // ---- sell-through & days of hand: both derived from the same GMV vs.
  // in-store-value comparison, recomputed from raw rows since they need
  // last-month and last-year VALUES (to build the comparison ratio), not
  // just the already-summarized growth% the direct metrics above retain.
  // doh = 7 × stock ÷ gmv is the exact reciprocal of sellThrough (gmv ÷
  // stock), scaled to days — computed in the same pass since both need the
  // same aggregated GMV/stock figures, but growth is computed on each
  // metric's own values (a reciprocal's % growth isn't just the negation of
  // the original's). ----
  const sellThroughWeekly: MetricWeekPoint[] = [];
  const dohWeekly: MetricWeekPoint[] = [];
  for (const week of weeks) {
    const rowsThisWeek = sell.filter((r) => r.week === week);
    const stValue = emptyGroupValues<number | null>(null);
    const stGrowthVsLastMonth = emptyGroupValues<number | null>(null);
    const stGrowthVsLastYear = emptyGroupValues<number | null>(null);
    const dohValue = emptyGroupValues<number | null>(null);
    const dohGrowthVsLastMonth = emptyGroupValues<number | null>(null);
    const dohGrowthVsLastYear = emptyGroupValues<number | null>(null);
    const n = emptyGroupValues<number>(0);

    // Sell-through is expressed as a % (of shelf stock sold that week), not a
    // bare 0-1 ratio — ×100 here, at the single source, rather than at every
    // display site. Growth is a percentage-POINT diff (kind "percent") to
    // match every other %-kind metric, not a relative % change.
    const sellThroughPct = (gmv: number | null, stock: number | null) => (gmv != null && stock != null && stock !== 0 ? (gmv / stock) * 100 : null);
    const dohRatio = (gmv: number | null, stock: number | null) => (gmv != null && stock != null && gmv !== 0 ? (stock / gmv) * 7 : null);

    for (const g of GROUPS) {
      const rowsInGroup = rowsThisWeek.filter((r) => groupOfWeek(r.store_id, week) === g);
      const thisGmv = aggregate(rowsInGroup.map((r) => r.this_month_gmv).filter((v): v is number => v != null));
      const thisStock = aggregate(rowsInGroup.map((r) => r.this_month_in_store_value).filter((v): v is number => v != null));
      const lmGmv = aggregate(rowsInGroup.map((r) => r.last_month_gmv).filter((v): v is number => v != null));
      const lmStock = aggregate(rowsInGroup.map((r) => r.last_month_in_store_value).filter((v): v is number => v != null));
      const lyGmv = aggregate(rowsInGroup.map((r) => r.last_year_gmv).filter((v): v is number => v != null));
      const lyStock = aggregate(rowsInGroup.map((r) => r.last_year_in_store_value).filter((v): v is number => v != null));

      const thisSt = sellThroughPct(thisGmv, thisStock);
      stValue[g] = thisSt;
      stGrowthVsLastMonth[g] = growthFor(thisSt, sellThroughPct(lmGmv, lmStock), "percent");
      stGrowthVsLastYear[g] = growthFor(thisSt, sellThroughPct(lyGmv, lyStock), "percent");

      const thisDoh = dohRatio(thisGmv, thisStock);
      dohValue[g] = thisDoh;
      dohGrowthVsLastMonth[g] = growthFor(thisDoh, dohRatio(lmGmv, lmStock), "days");
      dohGrowthVsLastYear[g] = growthFor(thisDoh, dohRatio(lyGmv, lyStock), "days");

      n[g] = rowsInGroup.filter((r) => r.this_month_gmv != null && r.this_month_in_store_value != null).length;
    }

    sellThroughWeekly.push({ week, value: stValue, growthVsLastMonth: stGrowthVsLastMonth, growthVsLastYear: stGrowthVsLastYear, n });
    dohWeekly.push({ week, value: dohValue, growthVsLastMonth: dohGrowthVsLastMonth, growthVsLastYear: dohGrowthVsLastYear, n });
  }

  const sellThroughSeries: MetricSeries = {
    key: "sellThrough",
    weekly: sellThroughWeekly,
    monthAvg: avgAcrossWeeks(sellThroughWeekly, (w) => w.value),
    monthGrowthVsLastMonth: avgAcrossWeeks(sellThroughWeekly, (w) => w.growthVsLastMonth),
    monthGrowthVsLastYear: avgAcrossWeeks(sellThroughWeekly, (w) => w.growthVsLastYear),
    monthN: sumWeeklyN(sellThroughWeekly),
  };

  const dohSeries: MetricSeries = {
    key: "doh",
    weekly: dohWeekly,
    monthAvg: avgAcrossWeeks(dohWeekly, (w) => w.value),
    monthGrowthVsLastMonth: avgAcrossWeeks(dohWeekly, (w) => w.growthVsLastMonth),
    monthGrowthVsLastYear: avgAcrossWeeks(dohWeekly, (w) => w.growthVsLastYear),
    monthN: sumWeeklyN(dohWeekly),
  };

  const metrics: MetricSeries[] = [...directMetrics, sellThroughSeries, dohSeries];

  const gmvSeries = metrics.find((m) => m.key === "gmv")!;

  // ---- verdict: diff-in-diff so control's own month-on-month movement
  // isn't credited to the campaign. Every figure is an average weekly value
  // per store, averaged across the weeks we have data for. ----
  const approvedThisMonth = gmvSeries.monthAvg.approved;
  const controlGrowth = gmvSeries.monthGrowthVsLastMonth.control;
  const approvedLastMonthByWeek = weeks
    .map((week) => {
      const rowsThisWeek = sell.filter((r) => r.week === week && groupOfWeek(r.store_id, week) === "approved");
      return aggregate(rowsThisWeek.map((r) => r.last_month_gmv).filter((v): v is number => v != null));
    })
    .filter((v): v is number => v != null);
  const approvedLastMonth = aggregate(approvedLastMonthByWeek);
  const incrementalValueVsLastMonth =
    approvedThisMonth != null && approvedLastMonth != null && controlGrowth != null
      ? approvedThisMonth - approvedLastMonth * (1 + controlGrowth / 100)
      : null;

  const verdict = {
    approvedGmvThisMonth: approvedThisMonth,
    approvedGmvLastMonth: approvedLastMonth,
    controlGrowthVsLastMonth: controlGrowth,
    incrementalValueVsLastMonth,
    poorGmvThisMonth: gmvSeries.monthAvg.poor,
    poorGrowthVsLastMonth: gmvSeries.monthGrowthVsLastMonth.poor,
    approvedStoreCount: [...allStoreIds].filter((id) => groupOf(id) === "approved").length,
    poorStoreCount: [...allStoreIds].filter((id) => groupOf(id) === "poor").length,
    controlStoreCount: [...allStoreIds].filter((id) => groupOf(id) === "control").length,
  };

  // ---- per-store rows ----
  const sellByStoreWeek = new Map<string, Map<number, any>>();
  for (const r of sell) {
    const m = sellByStoreWeek.get(r.store_id) ?? new Map<number, any>();
    m.set(r.week, r);
    sellByStoreWeek.set(r.store_id, m);
  }
  const invByStore = new Map<string, any[]>();
  for (const r of inventory) {
    const list = invByStore.get(r.store_id) ?? [];
    list.push(r);
    invByStore.set(r.store_id, list);
  }

  function median(values: number[]): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function growthPct(curr: number | null | undefined, prev: number | null | undefined): number | null {
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / Math.abs(prev)) * 100;
  }

  const stores: StoreRow[] = [...allStoreIds].map((storeId) => {
    const weekMap = sellByStoreWeek.get(storeId);
    const weekRows = weekMap ? [...weekMap.entries()].sort((a, b) => a[0] - b[0]) : [];
    const latest = weekRows[weekRows.length - 1]?.[1];

    const lmGrowths = weekRows.map(([, r]) => growthPct(r.this_month_gmv, r.last_month_gmv)).filter((v): v is number => v != null);
    const lyGrowths = weekRows.map(([, r]) => growthPct(r.this_month_gmv, r.last_year_gmv)).filter((v): v is number => v != null);
    const hasLastYearData = weekRows.some(([, r]) => r.last_year_gmv != null);

    const invRows = invByStore.get(storeId) ?? [];
    const storeAvailVals = invRows.map((r) => r.store_availability).filter((v): v is number => v != null);

    const gmvVals = weekRows.map(([, r]) => r.this_month_gmv).filter((v): v is number => v != null);
    const stockVals = weekRows.map(([, r]) => r.this_month_in_store_value).filter((v): v is number => v != null);
    const avgGmvForStore = aggregate(gmvVals);
    const avgStockForStore = aggregate(stockVals);
    const sellThroughForStore =
      avgGmvForStore != null && avgStockForStore != null && avgStockForStore !== 0 ? (avgGmvForStore / avgStockForStore) * 100 : null;
    const dohForStore = avgGmvForStore != null && avgStockForStore != null && avgGmvForStore !== 0 ? (avgStockForStore / avgGmvForStore) * 7 : null;

    const storeStatuses = statusByStore.get(storeId) ?? [];
    // Full week-by-week history, including weeks with no campaign row at all
    // (group "control" that week) — not just the weeks a status happened to exist for.
    const fullStatusByWeek: StoreStatusWeek[] = weeks.map((week) => ({
      week,
      status: storeStatuses.find((s) => s.week === week)?.status ?? null,
      group: groupOfWeek(storeId, week),
    }));

    return {
      storeId,
      storeName: storeNames.get(storeId) ?? "Unknown store",
      group: groupOf(storeId),
      statusByWeek: fullStatusByWeek,
      latestStatus: latestStatusByStore.get(storeId) ?? null,
      gmv: latest?.this_month_gmv ?? null,
      gmvGrowthVsLastMonth: median(lmGrowths),
      gmvGrowthVsLastYear: median(lyGrowths),
      hasLastYearData,
      storeAvailability: avgPercent(storeAvailVals),
      inStoreValue: avgStockForStore,
      sellThrough: sellThroughForStore,
      doh: dohForStore,
    };
  });
  stores.sort((a, b) => (b.gmvGrowthVsLastMonth ?? -Infinity) - (a.gmvGrowthVsLastMonth ?? -Infinity));

  const weeklyGroupCounts = weeks.map((week) => {
    const counts = { week, approved: 0, poor: 0, control: 0 };
    for (const storeId of allStoreIds) counts[groupOfWeek(storeId, week)] += 1;
    return counts;
  });

  // ---- stock: store availability by group (control carries no Inventory
  // Data), warehouse availability as a single shared figure. The sheet
  // already reports both as a percentage per SKU/store/week, so every figure
  // here is an average of that percentage, not a ratio of raw counts. ----
  const byWeek = new Map<number, { approved: number[]; poor: number[] }>();
  const byWeekWh = new Map<number, number[]>();
  for (const r of inventory) {
    if (r.wh_availability != null) {
      const list = byWeekWh.get(r.week) ?? [];
      list.push(r.wh_availability);
      byWeekWh.set(r.week, list);
    }
    const g = groupOfWeek(r.store_id, r.week);
    if (g === "control") continue;
    if (r.store_availability == null) continue;
    const acc = byWeek.get(r.week) ?? { approved: [], poor: [] };
    acc[g].push(r.store_availability);
    byWeek.set(r.week, acc);
  }
  const weekly: WeeklyStockPoint[] = [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, acc]) => ({
      week,
      totalStoreAvailability: avgPercent([...acc.approved, ...acc.poor]),
      approvedStoreAvailability: avgPercent(acc.approved),
      poorStoreAvailability: avgPercent(acc.poor),
    }));
  const weeklyWarehouse: WeeklyWarehousePoint[] = [...byWeekWh.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, vals]) => ({ week, whAvailability: avgPercent(vals) }));

  const approvedStoreAvail: number[] = [];
  const poorStoreAvail: number[] = [];
  const allWhAvail: number[] = [];
  const bySkuAcc = new Map<string, { skuId: string; productName: string; approved: number[]; poor: number[]; wh: number[] }>();
  for (const r of inventory) {
    if (r.wh_availability != null) allWhAvail.push(r.wh_availability);
    const g = groupOfWeek(r.store_id, r.week);
    if (g === "control") continue;
    if (r.store_availability != null) {
      (g === "approved" ? approvedStoreAvail : poorStoreAvail).push(r.store_availability);
    }
    const acc = bySkuAcc.get(r.sku_id) ?? { skuId: r.sku_id, productName: r.product_name, approved: [] as number[], poor: [] as number[], wh: [] as number[] };
    if (r.store_availability != null) acc[g === "approved" ? "approved" : "poor"].push(r.store_availability);
    if (r.wh_availability != null) acc.wh.push(r.wh_availability);
    bySkuAcc.set(r.sku_id, acc);
  }

  const bySku: SkuStockRow[] = [...bySkuAcc.values()]
    .map((acc) => ({
      skuId: acc.skuId,
      productName: acc.productName,
      approvedAvailability: avgPercent(acc.approved),
      poorAvailability: avgPercent(acc.poor),
      whAvailability: avgPercent(acc.wh),
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName));

  const stock = {
    weekly,
    weeklyWarehouse,
    avgStoreAvailability: {
      total: avgPercent([...approvedStoreAvail, ...poorStoreAvail]),
      approved: avgPercent(approvedStoreAvail),
      poor: avgPercent(poorStoreAvail),
    },
    avgWhAvailability: avgPercent(allWhAvail),
    bySku,
  };

  const approvedYearStores = stores.filter((s) => s.group === "approved" && s.hasLastYearData);
  const lastYear = {
    approvedStoresWithData: approvedYearStores.length,
    approvedStoresTotal: verdict.approvedStoreCount,
    storeNames: approvedYearStores.map((s) => s.storeName),
  };

  const { hasBrand, brandBaseline } = await getSmartBaseline(campaignKey, month);

  return { verdict, metrics, stores, stock, lastYear, weeklyGroupCounts, hasBrand, brandBaseline };
}

function previousMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ==================== brand baseline (smart "last month") ====================
// A brand's monthly campaigns ("Tide - August", "Tide - July"...) are each
// a fully independent Vero campaign with no shared identity of their own —
// the only link is campaigns.brand_id. contest_campaign_rows carries
// campaign_id (via the Vero-sync path), so we can join through that to find
// a brand's real execution history without any separate mapping table.

async function resolveCampaignAndBrand(campaignKey: string, month: string): Promise<{ campaignId: string; brandId: string } | null> {
  const supabase = await createClient();
  const monthDate = `${month}-01`;
  const { data } = await supabase
    .from("contest_campaign_rows")
    .select("campaign_id, raw_campaign_name")
    .eq("month", monthDate)
    .not("campaign_id", "is", null);
  const row = ((data as any[]) ?? []).find((r) => normalizeName(r.raw_campaign_name) === campaignKey);
  if (!row) return null;
  const { data: campaign } = await supabase.from("campaigns").select("brand_id").eq("id", row.campaign_id).maybeSingle();
  const brandId = (campaign as any)?.brand_id;
  if (!brandId) return null;
  return { campaignId: row.campaign_id, brandId };
}

/** Every calendar month (YYYY-MM) this brand has ≥1 contest_campaign_rows
 * row with a campaign_id under it — i.e. actually-synced execution data.
 * Sorted ascending. Only sees Vero-synced rows (campaign_id not null); any
 * CSV-only historical months for a brand, pre-dating the Vero sync, won't
 * be visible here and could look like a false gap — a non-issue today
 * since all current contest data comes via the Vero-sync path. */
async function getBrandActiveMonths(brandId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data: brandCampaigns } = await supabase.from("campaigns").select("id").eq("brand_id", brandId);
  const campaignIds = ((brandCampaigns as any[]) ?? []).map((c) => c.id);
  if (!campaignIds.length) return [];
  const { data: rows } = await supabase.from("contest_campaign_rows").select("month").in("campaign_id", campaignIds);
  const months = new Set(((rows as any[]) ?? []).map((r) => (r.month as string).slice(0, 7)));
  return [...months].sort();
}

/** Walks backward from `month` through consecutive active months for this
 * brand. Returns the month immediately BEFORE the unbroken streak
 * containing `month` — the baseline candidate. Null if `month` itself
 * isn't active, or the brand has no active-month data at all. If the brand
 * has never had a gap, this walks all the way back to before it first ever
 * ran — that's intentional, not a bug to special-case. */
function findBaselineMonth(activeMonths: string[], month: string): string | null {
  const active = new Set(activeMonths);
  if (!active.has(month)) return null;
  let cursor = month;
  while (active.has(previousMonthKey(cursor))) cursor = previousMonthKey(cursor);
  return previousMonthKey(cursor);
}

/** Raw, ungrouped aggregate for a set of stores in one month — used only
 * for a pre-campaign baseline, where there's no approved/poor/control
 * split because no campaign existed yet. Deliberately does NOT filter by
 * raw_campaign_name — the premise is "what these stores looked like before
 * this brand's tracked campaign existed under any name."
 *
 * Known limitation: contest_sell_side_rows is technically scoped per
 * uploaded campaign sheet (every row carries its own raw_campaign_name), so
 * if a store has a sell-side row for this month that was uploaded under an
 * unrelated campaign/category, it gets picked up here too. Acceptable for
 * a baseline explicitly framed as "before this brand ran" — not filtering
 * by name is the whole point — but worth knowing if a baseline number ever
 * looks surprising. */
async function getRawStoreAggregateForMonth(
  storeIds: string[],
  month: string,
): Promise<{ gmv: number | null; inStoreValue: number | null; sellThrough: number | null; storeCount: number } | null> {
  if (!storeIds.length) return null;
  const supabase = await createClient();
  const monthDate = `${month}-01`;
  const { data } = await supabase
    .from("contest_sell_side_rows")
    .select("store_id, this_month_gmv, this_month_in_store_value")
    .eq("month", monthDate)
    .in("store_id", storeIds);
  const usable = ((data as any[]) ?? []).filter((r) => r.this_month_gmv != null);
  if (!usable.length) return null;
  const gmv = aggregate(usable.map((r) => r.this_month_gmv));
  const inStoreValue = aggregate(usable.map((r) => r.this_month_in_store_value).filter((v: number | null): v is number => v != null));
  const sellThrough = gmv != null && inStoreValue ? (gmv / inStoreValue) * 100 : null;
  return { gmv, inStoreValue, sellThrough, storeCount: new Set(usable.map((r) => r.store_id)).size };
}

/** Top-level entry: baseline month + a capped fallback walk (24 further
 * months) to the oldest data actually available, if the exact candidate
 * month has none. Never throws — hasBrand is false when this campaign
 * doesn't resolve to a brand at all (gates whether the UI shows the panel
 * at all); brandBaseline is null when hasBrand is true but nothing was
 * found within the cap (UI shows "no historical baseline available" rather
 * than a misleading number, instead of hiding the panel). */
async function getSmartBaseline(
  campaignKey: string,
  month: string,
): Promise<{ hasBrand: boolean; brandBaseline: ContestMonthReport["brandBaseline"] }> {
  const resolved = await resolveCampaignAndBrand(campaignKey, month);
  if (!resolved) return { hasBrand: false, brandBaseline: null };

  const supabase = await createClient();
  const { data: storeRows } = await supabase.from("campaign_stores").select("store_id").eq("campaign_id", resolved.campaignId);
  const campaignStoreIds = ((storeRows as any[]) ?? []).map((r) => r.store_id);
  if (!campaignStoreIds.length) return { hasBrand: true, brandBaseline: null };

  const activeMonths = await getBrandActiveMonths(resolved.brandId);
  const candidate = findBaselineMonth(activeMonths, month);
  if (!candidate) return { hasBrand: true, brandBaseline: null };

  let probe = candidate;
  for (let i = 0; i < 25; i++) {
    const result = await getRawStoreAggregateForMonth(campaignStoreIds, probe);
    if (result) return { hasBrand: true, brandBaseline: { month: probe, usedFallback: i > 0, ...result } };
    probe = previousMonthKey(probe);
  }
  return { hasBrand: true, brandBaseline: null };
}

export type ContestReport = { diagnosis: ContestDiagnosis; narrative: ContestReportNarrative };

/** Cached "Is it working?" report for one campaign + month — same fingerprint-
 * and-cache pattern as the headline. The diagnosis (verdict/trend/root cause)
 * is always recomputed fresh from the live report since it's pure/cheap; only
 * the AI narrative is what's cached and reused. */
export async function getOrGenerateContestReport(
  campaignKey: string,
  campaignLabel: string,
  month: string,
  report: ContestMonthReport,
  opts?: { force?: boolean },
): Promise<ContestReport | { error: string }> {
  const diagnosis = diagnoseContest(report);
  const supabase = await createClient();
  const monthDate = `${month}-01`;
  const fingerprint = computeReportFingerprint(campaignLabel, month, report, diagnosis);

  if (!opts?.force) {
    const { data: cached } = await supabase
      .from("contest_ai_reports")
      .select("verdict_sentence, mechanism, root_cause, data_fingerprint")
      .eq("campaign_key", campaignKey)
      .eq("month", monthDate)
      .maybeSingle();
    if (cached && (cached as any).data_fingerprint === fingerprint) {
      return {
        diagnosis,
        narrative: { verdictSentence: (cached as any).verdict_sentence, mechanism: (cached as any).mechanism, rootCause: (cached as any).root_cause },
      };
    }
  }

  const prevMonth = previousMonthKey(month);
  const { data: prevRow } = await supabase
    .from("contest_ai_reports")
    .select("verdict_sentence, mechanism")
    .eq("campaign_key", campaignKey)
    .eq("month", `${prevMonth}-01`)
    .maybeSingle();

  const result = await generateContestReportNarrative({
    campaignLabel,
    month,
    report,
    diagnosis,
    previous: prevRow ? { month: prevMonth, verdictSentence: (prevRow as any).verdict_sentence, mechanism: (prevRow as any).mechanism } : null,
  });
  if ("error" in result) return result;

  await supabase
    .from("contest_ai_reports")
    .upsert(
      {
        campaign_key: campaignKey,
        month: monthDate,
        verdict: diagnosis.verdict,
        trend: diagnosis.trend,
        verdict_sentence: result.verdictSentence,
        mechanism: result.mechanism,
        root_cause: result.rootCause,
        data_fingerprint: fingerprint,
      },
      { onConflict: "campaign_key,month" },
    );

  return { diagnosis, narrative: result };
}
