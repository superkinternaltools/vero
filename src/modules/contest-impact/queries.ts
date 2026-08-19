import { createClient } from "@/core/db/server";
import { SELL_METRICS } from "./types";
import type {
  NameOption,
  CampaignOption,
  ContestGroup,
  ContestMonthReport,
  DailyStockPoint,
  GroupValues,
  MetricKind,
  MetricSeries,
  MetricWeekPoint,
  SellMetricKey,
  SkuStockRow,
  StoreRow,
  StoreStatusWeek,
  WeeklyStockPoint,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
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
  const { data } = await supabase.from("contest_campaign_rows").select("raw_campaign_name");
  const seen = new Map<string, string>();
  for (const r of (data as any[]) ?? []) {
    const key = normalizeName(r.raw_campaign_name);
    if (!seen.has(key)) seen.set(key, r.raw_campaign_name.trim());
  }
  return [...seen.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function listAvailableMonths(campaignKey: string): Promise<string[]> {
  const supabase = await createClient();
  const [{ data: c }, { data: i }, { data: s }] = await Promise.all([
    supabase.from("contest_campaign_rows").select("month, raw_campaign_name"),
    supabase.from("contest_inventory_rows").select("month, raw_campaign_name"),
    supabase.from("contest_sell_side_rows").select("month, raw_campaign_name"),
  ]);
  const all = [...((c as any[]) ?? []), ...((i as any[]) ?? []), ...((s as any[]) ?? [])];
  const months = new Set<string>();
  for (const r of all) {
    if (normalizeName(r.raw_campaign_name) !== campaignKey) continue;
    months.add((r.month as string).slice(0, 7));
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

  const [{ data: rows }, { data: classified }] = await Promise.all([
    supabase.from("contest_campaign_rows").select("raw_campaign_name, status").eq("month", monthDate),
    supabase.from("contest_status_classification").select("raw_status").eq("campaign_key", campaignKey),
  ]);

  const known = new Set(((classified as any[]) ?? []).map((c) => c.raw_status));
  const seen = new Set<string>();
  for (const r of (rows as any[]) ?? []) {
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

// ==================== report ====================

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function pctRatio(numer: number, denom: number): number | null {
  if (denom === 0) return null;
  return (numer / denom) * 100;
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

const FIELD_BY_METRIC: Record<SellMetricKey, { this: string; lastMonth: string; lastYear: string }> = {
  gmv: { this: "this_month_gmv", lastMonth: "last_month_gmv", lastYear: "last_year_gmv" },
  penetration: { this: "this_month_penetration", lastMonth: "last_month_penetration", lastYear: "last_year_penetration" },
  avgUnit: { this: "this_month_avg_unit", lastMonth: "last_month_avg_unit", lastYear: "last_year_avg_unit" },
  categoryContribution: {
    this: "this_month_category_contribution",
    lastMonth: "last_month_category_contribution",
    lastYear: "last_year_category_contribution",
  },
};

const GROUPS: ContestGroup[] = ["approved", "poor", "control"];

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

  // Fetch in batches to bypass Supabase's 1000-row default page limit.
  const fetchBatch = async (table: string, offset: number, limit: number) => {
    const { data, error } = await supabase.from(table).select("*").eq("month", monthDate).range(offset, offset + limit - 1);
    if (error) throw error;
    return data ?? [];
  };
  const fetchAll = async (table: string, batchSize: number) => {
    const out: any[] = [];
    for (let offset = 0; ; offset += batchSize) {
      const batch = await fetchBatch(table, offset, batchSize);
      out.push(...batch);
      if (batch.length < batchSize) break;
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
  const sellAll = (sellRowsRaw as any[]).filter((r) => r.store_id && matchesCampaign(r.raw_campaign_name));

  // ---- group every store by its latest-week status this month ----
  const statusByStore = new Map<string, StoreStatusWeek[]>();
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
  const groupOf = (storeId: string): ContestGroup => {
    const status = latestStatusByStore.get(storeId);
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
  const lastWeek = weeks[weeks.length - 1];

  const metrics: MetricSeries[] = SELL_METRICS.map(({ key }) => {
    const fields = FIELD_BY_METRIC[key];

    const weekly: MetricWeekPoint[] = weeks.map((week) => {
      const rowsThisWeek = sell.filter((r) => r.week === week);
      const value = emptyGroupValues<number | null>(null);
      const growthVsLastMonth = emptyGroupValues<number | null>(null);
      const growthVsLastYear = emptyGroupValues<number | null>(null);
      const n = emptyGroupValues<number>(0);

      for (const g of GROUPS) {
        const rowsInGroup = rowsThisWeek.filter((r) => groupOf(r.store_id) === g);
        const thisVals = rowsInGroup.map((r) => r[fields.this]).filter((v): v is number => v != null);
        const lmVals = rowsInGroup.map((r) => r[fields.lastMonth]).filter((v): v is number => v != null);
        const lyVals = rowsInGroup.map((r) => r[fields.lastYear]).filter((v): v is number => v != null);

        const thisAgg = aggregate(thisVals);
        const lmAgg = aggregate(lmVals);
        const lyAgg = aggregate(lyVals);

        const kind = SELL_METRICS.find((m) => m.key === key)!.kind;
        value[g] = thisAgg;
        growthVsLastMonth[g] = growthFor(thisAgg, lmAgg, kind);
        growthVsLastYear[g] = growthFor(thisAgg, lyAgg, kind);
        n[g] = thisVals.length;
      }

      return { week, value, growthVsLastMonth, growthVsLastYear, n };
    });

    const monthPoint = weekly.find((w) => w.week === lastWeek);
    return {
      key,
      weekly,
      monthAvg: monthPoint?.value ?? emptyGroupValues<number | null>(null),
      monthGrowthVsLastMonth: monthPoint?.growthVsLastMonth ?? emptyGroupValues<number | null>(null),
      monthGrowthVsLastYear: monthPoint?.growthVsLastYear ?? emptyGroupValues<number | null>(null),
      monthN: monthPoint?.n ?? emptyGroupValues<number>(0),
    };
  });

  const gmvSeries = metrics.find((m) => m.key === "gmv")!;

  // ---- verdict: diff-in-diff so control's own month-on-month movement
  // isn't credited to the campaign. Every figure is an average per store. ----
  const approvedThisMonth = gmvSeries.monthAvg.approved;
  const controlGrowth = gmvSeries.monthGrowthVsLastMonth.control;
  const approvedLastWeekRows = sell.filter((r) => r.week === lastWeek && groupOf(r.store_id) === "approved");
  const approvedLastMonth = aggregate(approvedLastWeekRows.map((r) => r.last_month_gmv).filter((v): v is number => v != null));
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
    let sumIn = 0, sumTarget = 0, hits = 0, counted = 0;
    for (const r of invRows) {
      if (r.in_store_stock != null && r.target_store_stock != null) {
        sumIn += r.in_store_stock;
        sumTarget += r.target_store_stock;
        counted += 1;
        if (r.in_store_stock >= r.target_store_stock) hits += 1;
      }
    }

    return {
      storeId,
      storeName: storeNames.get(storeId) ?? "Unknown store",
      group: groupOf(storeId),
      statusByWeek: (statusByStore.get(storeId) ?? []).sort((a, b) => a.week - b.week),
      latestStatus: latestStatusByStore.get(storeId) ?? null,
      gmv: latest?.this_month_gmv ?? null,
      gmvGrowthVsLastMonth: median(lmGrowths),
      gmvGrowthVsLastYear: median(lyGrowths),
      hasLastYearData,
      storeStockFillRate: pctRatio(sumIn, sumTarget),
      storeSkuOnTargetPct: counted ? pctRatio(hits, counted) : null,
    };
  });
  stores.sort((a, b) => (b.gmvGrowthVsLastMonth ?? -Infinity) - (a.gmvGrowthVsLastMonth ?? -Infinity));

  // ---- stock: approved vs poor only — control carries no Inventory Data ----
  const inventorySorted = [...inventory].sort((a, b) => {
    const da = a.day ?? "";
    const db = b.day ?? "";
    if (da !== db) return da < db ? -1 : 1;
    return a.week - b.week;
  });

  const byDay = new Map<string, { approvedIn: number; approvedTarget: number; poorIn: number; poorTarget: number }>();
  const byWeek = new Map<number, { approvedIn: number; approvedTarget: number; poorIn: number; poorTarget: number }>();
  for (const r of inventorySorted) {
    if (r.in_store_stock == null || r.target_store_stock == null) continue;
    const g = groupOf(r.store_id);
    if (g === "control") continue;

    if (r.day) {
      const acc = byDay.get(r.day) ?? { approvedIn: 0, approvedTarget: 0, poorIn: 0, poorTarget: 0 };
      if (g === "approved") { acc.approvedIn += r.in_store_stock; acc.approvedTarget += r.target_store_stock; }
      else { acc.poorIn += r.in_store_stock; acc.poorTarget += r.target_store_stock; }
      byDay.set(r.day, acc);
    }

    const wAcc = byWeek.get(r.week) ?? { approvedIn: 0, approvedTarget: 0, poorIn: 0, poorTarget: 0 };
    if (g === "approved") { wAcc.approvedIn += r.in_store_stock; wAcc.approvedTarget += r.target_store_stock; }
    else { wAcc.poorIn += r.in_store_stock; wAcc.poorTarget += r.target_store_stock; }
    byWeek.set(r.week, wAcc);
  }

  const daily: DailyStockPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, acc]) => ({
      day,
      approvedFillRate: pctRatio(acc.approvedIn, acc.approvedTarget),
      poorFillRate: pctRatio(acc.poorIn, acc.poorTarget),
    }));

  const weekly: WeeklyStockPoint[] = [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, acc]) => ({
      week,
      approvedFillRate: pctRatio(acc.approvedIn, acc.approvedTarget),
      poorFillRate: pctRatio(acc.poorIn, acc.poorTarget),
    }));

  let approvedIn = 0, approvedTarget = 0, poorIn = 0, poorTarget = 0, poorShortfall = 0;
  const bySkuPoor = new Map<string, { sumIn: number; sumTarget: number; hits: number; counted: number; shortfall: number; warehouse: number | null }>();
  for (const r of inventorySorted) {
    const g = groupOf(r.store_id);
    if (g === "control") continue;
    if (r.in_store_stock != null && r.target_store_stock != null) {
      if (g === "approved") { approvedIn += r.in_store_stock; approvedTarget += r.target_store_stock; }
      else {
        poorIn += r.in_store_stock;
        poorTarget += r.target_store_stock;
        poorShortfall += Math.max(0, r.target_store_stock - r.in_store_stock);
      }
    }
    if (g === "poor") {
      const acc = bySkuPoor.get(r.sku_name) ?? { sumIn: 0, sumTarget: 0, hits: 0, counted: 0, shortfall: 0, warehouse: null };
      if (r.in_store_stock != null && r.target_store_stock != null) {
        acc.sumIn += r.in_store_stock;
        acc.sumTarget += r.target_store_stock;
        acc.counted += 1;
        if (r.in_store_stock >= r.target_store_stock) acc.hits += 1;
        acc.shortfall += Math.max(0, r.target_store_stock - r.in_store_stock);
      }
      if (r.in_warehouse_stock != null) acc.warehouse = r.in_warehouse_stock;
      bySkuPoor.set(r.sku_name, acc);
    }
  }

  const bySku: SkuStockRow[] = [...bySkuPoor.entries()]
    .map(([skuName, acc]) => ({
      skuName,
      avgFillRate: pctRatio(acc.sumIn, acc.sumTarget),
      onTargetPct: acc.counted ? pctRatio(acc.hits, acc.counted) : null,
      shortfallUnits: acc.shortfall,
      warehouseUnits: acc.warehouse,
      coverMultiple: acc.warehouse != null && acc.shortfall > 0 ? acc.warehouse / acc.shortfall : null,
    }))
    .sort((a, b) => a.skuName.localeCompare(b.skuName));

  const warehouseUnits = bySku.reduce((acc, s) => acc + (s.warehouseUnits ?? 0), 0) || null;

  const stock = {
    daily,
    weekly,
    avgFillRate: { approved: pctRatio(approvedIn, approvedTarget), poor: pctRatio(poorIn, poorTarget) },
    shortfallUnitsPoor: poorShortfall || null,
    warehouseUnits,
    coverMultiple: warehouseUnits != null && poorShortfall > 0 ? warehouseUnits / poorShortfall : null,
    bySku,
  };

  const approvedYearStores = stores.filter((s) => s.group === "approved" && s.hasLastYearData);
  const lastYear = {
    approvedStoresWithData: approvedYearStores.length,
    approvedStoresTotal: verdict.approvedStoreCount,
    storeNames: approvedYearStores.map((s) => s.storeName),
  };

  return { verdict, metrics, stores, stock, lastYear };
}
