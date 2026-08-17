import { createClient } from "@/core/db/server";
import { SELL_METRICS } from "./types";
import type {
  NameOption,
  CampaignOption,
  ContestGroup,
  ContestMonthReport,
  DailyStockPoint,
  GrowthStat,
  MetricComparison,
  SellMetricKey,
  SkuStockRow,
  StoreRow,
  StoreStatusWeek,
  WeekSales,
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

// ==================== report ====================

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

function pctRatio(numer: number, denom: number): number | null {
  if (denom === 0) return null;
  return (numer / denom) * 100;
}

function growthStat(contestValues: number[], controlValues: number[]): GrowthStat {
  const contest = median(contestValues);
  const control = median(controlValues);
  return {
    contest,
    control,
    gapPct: contest != null && control != null ? contest - control : null,
    contestN: contestValues.length,
    controlN: controlValues.length,
  };
}

type SellObs = {
  storeId: string;
  week: number;
  group: ContestGroup;
  thisMonth: Record<SellMetricKey, number | null>;
  lastMonth: Record<SellMetricKey, number | null>;
  lastYear: Record<SellMetricKey, number | null>;
};

function metricComparison(obs: SellObs[]): MetricComparison {
  const out = {} as MetricComparison;
  for (const { key } of SELL_METRICS) {
    const vsLm = { contest: [] as number[], control: [] as number[] };
    const vsLy = { contest: [] as number[], control: [] as number[] };
    for (const o of obs) {
      const lm = growthPct(o.thisMonth[key], o.lastMonth[key]);
      const ly = growthPct(o.thisMonth[key], o.lastYear[key]);
      if (lm != null) vsLm[o.group].push(lm);
      if (ly != null) vsLy[o.group].push(ly);
    }
    out[key] = {
      vsLastMonth: growthStat(vsLm.contest, vsLm.control),
      vsLastYear: growthStat(vsLy.contest, vsLy.control),
    };
  }
  return out;
}

export async function getContestMonthReport(campaignKey: string, month: string): Promise<ContestMonthReport> {
  const supabase = await createClient();
  const monthDate = `${month}-01`;
  const matchesCampaign = (name: string) => normalizeName(name) === campaignKey;

  const [{ data: campaignRows }, { data: inventoryRows }, { data: sellRows }] = await Promise.all([
    supabase
      .from("contest_campaign_rows")
      .select("raw_campaign_name, store_id, week, status, stores ( name )")
      .eq("month", monthDate),
    supabase
      .from("contest_inventory_rows")
      .select(
        "raw_campaign_name, store_id, week, day, sku_name, target_store_stock, in_store_stock, target_warehouse_stock, in_warehouse_stock, stores ( name )",
      )
      .eq("month", monthDate),
    supabase
      .from("contest_sell_side_rows")
      .select(
        `
        raw_campaign_name, store_id, week, stores ( name ),
        this_month_gmv, last_month_gmv, last_year_gmv,
        this_month_penetration, last_month_penetration, last_year_penetration,
        this_month_avg_unit, last_month_avg_unit, last_year_avg_unit,
        this_month_category_contribution, last_month_category_contribution, last_year_category_contribution
        `,
      )
      .eq("month", monthDate),
  ]);

  const campaign = ((campaignRows as any[]) ?? []).filter((r) => r.store_id && matchesCampaign(r.raw_campaign_name));
  const inventory = ((inventoryRows as any[]) ?? []).filter((r) => r.store_id && matchesCampaign(r.raw_campaign_name));
  const sell = ((sellRows as any[]) ?? []).filter((r) => r.store_id && matchesCampaign(r.raw_campaign_name));

  const storeNames = new Map<string, string>();
  const statusByStore = new Map<string, StoreStatusWeek[]>();
  for (const r of campaign) {
    storeNames.set(r.store_id, r.stores?.name ?? "Unknown store");
    const list = statusByStore.get(r.store_id) ?? [];
    list.push({ week: r.week, status: r.status });
    statusByStore.set(r.store_id, list);
  }
  for (const r of inventory) storeNames.set(r.store_id, r.stores?.name ?? "Unknown store");
  for (const r of sell) storeNames.set(r.store_id, r.stores?.name ?? "Unknown store");

  const contestStoreIds = new Set(statusByStore.keys());
  const allStoreIds = new Set<string>([
    ...contestStoreIds,
    ...inventory.map((r) => r.store_id),
    ...sell.map((r) => r.store_id),
  ]);
  const groupOf = (storeId: string): ContestGroup => (contestStoreIds.has(storeId) ? "contest" : "control");

  // ---- sales: build one observation per (store, week) ----
  const sellByStoreWeek = new Map<string, Map<number, any>>();
  for (const r of sell) {
    const m = sellByStoreWeek.get(r.store_id) ?? new Map<number, any>();
    m.set(r.week, r);
    sellByStoreWeek.set(r.store_id, m);
  }

  const allObs: SellObs[] = [];
  for (const r of sell) {
    allObs.push({
      storeId: r.store_id,
      week: r.week,
      group: groupOf(r.store_id),
      thisMonth: {
        gmv: r.this_month_gmv,
        penetration: r.this_month_penetration,
        avgUnit: r.this_month_avg_unit,
        categoryContribution: r.this_month_category_contribution,
      },
      lastMonth: {
        gmv: r.last_month_gmv,
        penetration: r.last_month_penetration,
        avgUnit: r.last_month_avg_unit,
        categoryContribution: r.last_month_category_contribution,
      },
      lastYear: {
        gmv: r.last_year_gmv,
        penetration: r.last_year_penetration,
        avgUnit: r.last_year_avg_unit,
        categoryContribution: r.last_year_category_contribution,
      },
    });
  }

  const weeks = [...new Set(allObs.map((o) => o.week))].sort((a, b) => a - b);
  const weeklySales: WeekSales[] = weeks.map((week) => ({
    week,
    metrics: metricComparison(allObs.filter((o) => o.week === week)),
  }));
  const pooledSales = metricComparison(allObs);

  const firstWeek = weeks[0];
  const week1 = weeklySales.find((w) => w.week === firstWeek);
  const pooledGmvLm = pooledSales.gmv.vsLastMonth;
  const verdict = {
    contestGmvGrowth: pooledGmvLm.contest,
    controlGmvGrowth: pooledGmvLm.control,
    gapPct: pooledGmvLm.gapPct,
    week1ContestGmvGrowth: week1?.metrics.gmv.vsLastMonth.contest ?? null,
    week1ControlGmvGrowth: week1?.metrics.gmv.vsLastMonth.control ?? null,
    contestStoreCount: contestStoreIds.size,
    controlStoreCount: allStoreIds.size - contestStoreIds.size,
  };

  // ---- per-store rows ----
  const invByStore = new Map<string, any[]>();
  for (const r of inventory) {
    const list = invByStore.get(r.store_id) ?? [];
    list.push(r);
    invByStore.set(r.store_id, list);
  }

  const stores: StoreRow[] = [...allStoreIds].map((storeId) => {
    const weekMap = sellByStoreWeek.get(storeId);
    const weekRows = weekMap ? [...weekMap.entries()].sort((a, b) => a[0] - b[0]) : [];
    const latest = weekRows[weekRows.length - 1]?.[1];

    const lmGrowths = weekRows
      .map(([, r]) => growthPct(r.this_month_gmv, r.last_month_gmv))
      .filter((v): v is number => v != null);
    const lyGrowths = weekRows
      .map(([, r]) => growthPct(r.this_month_gmv, r.last_year_gmv))
      .filter((v): v is number => v != null);
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
      gmv: latest?.this_month_gmv ?? null,
      gmvGrowthVsLastMonth: median(lmGrowths),
      gmvGrowthVsLastYear: median(lyGrowths),
      hasLastYearData,
      storeStockFillRate: pctRatio(sumIn, sumTarget),
      storeSkuOnTargetPct: counted ? pctRatio(hits, counted) : null,
    };
  });
  stores.sort((a, b) => (b.gmvGrowthVsLastMonth ?? -Infinity) - (a.gmvGrowthVsLastMonth ?? -Infinity));

  // ---- daily stock ----
  const byDay = new Map<string, { sumIn: number; sumTarget: number }>();
  for (const r of inventory) {
    if (!r.day || r.in_store_stock == null || r.target_store_stock == null) continue;
    const acc = byDay.get(r.day) ?? { sumIn: 0, sumTarget: 0 };
    acc.sumIn += r.in_store_stock;
    acc.sumTarget += r.target_store_stock;
    byDay.set(r.day, acc);
  }
  const dailyStock: DailyStockPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, acc]) => ({ day, fillRate: pctRatio(acc.sumIn, acc.sumTarget) }));

  // ---- per-SKU stock ----
  const bySku = new Map<
    string,
    { sumIn: number; sumTarget: number; hits: number; counted: number; shortfall: number; warehouse: number | null }
  >();
  for (const r of inventory) {
    const acc = bySku.get(r.sku_name) ?? { sumIn: 0, sumTarget: 0, hits: 0, counted: 0, shortfall: 0, warehouse: null };
    if (r.in_store_stock != null && r.target_store_stock != null) {
      acc.sumIn += r.in_store_stock;
      acc.sumTarget += r.target_store_stock;
      acc.counted += 1;
      if (r.in_store_stock >= r.target_store_stock) acc.hits += 1;
      acc.shortfall += Math.max(0, r.target_store_stock - r.in_store_stock);
    }
    if (r.in_warehouse_stock != null) acc.warehouse = r.in_warehouse_stock;
    bySku.set(r.sku_name, acc);
  }
  const skuStock: SkuStockRow[] = [...bySku.entries()]
    .map(([skuName, acc]) => ({
      skuName,
      avgFillRate: pctRatio(acc.sumIn, acc.sumTarget),
      onTargetPct: acc.counted ? pctRatio(acc.hits, acc.counted) : null,
      shortfallUnits: acc.shortfall,
      warehouseUnits: acc.warehouse,
      coverMultiple: acc.warehouse != null && acc.shortfall > 0 ? acc.warehouse / acc.shortfall : null,
    }))
    .sort((a, b) => a.skuName.localeCompare(b.skuName));

  const lastYearStores = stores.filter((s) => s.group === "contest" && s.hasLastYearData);
  const lastYear = {
    contestStoresWithData: lastYearStores.length,
    contestStoresTotal: contestStoreIds.size,
    storeNames: lastYearStores.map((s) => s.storeName),
  };

  return { verdict, weeklySales, pooledSales, stores, dailyStock, skuStock, lastYear };
}
