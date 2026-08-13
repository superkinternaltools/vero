import { createClient } from "@/core/db/server";
import { GROUP_ORDER, APPROVED_STATUSES } from "./types";
import type {
  NameOption,
  CampaignOption,
  GroupKey,
  GroupSummary,
  StoreDetailRow,
  WeekReport,
  WeekTrendPoint,
  MonthlyOverview,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Fetches all rows from a paginated Supabase query, bypassing the default
 * 1000-row cap. Every read in this module that isn't scoped to a single
 * campaign×store×day needs this — daily, SKU-level data reaches 50,000+ rows
 * for one campaign in one month, and a query that silently truncates at 1000
 * doesn't fail, it just feeds wrong numbers into every median downstream. */
async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const results: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
  }
  return results;
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
  const data = await fetchAllRows<{ raw_campaign_name: string }>((from, to) =>
    supabase.from("contest_campaign_rows").select("raw_campaign_name").range(from, to),
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

type WeekRow = { month: string; week: number; raw_campaign_name: string };

/** Distinct real Vero campaign names, for the template generator's contest
 * picker. Deliberately NOT sourced from contest_campaign_rows like
 * listCampaignOptions above — that list only contains names that have
 * already been imported once, which would make templates useless for their
 * actual purpose: producing the first sheet for a contest that has no data
 * in Vero yet. */
export async function listContestNameOptions(): Promise<CampaignOption[]> {
  const supabase = await createClient();
  const rows = await fetchAllRows<{ name: string }>((from, to) =>
    supabase.from("campaigns").select("name").is("deleted_at", null).range(from, to),
  );
  const seen = new Map<string, string>();
  for (const r of rows) {
    const key = normalizeName(r.name);
    if (!seen.has(key)) seen.set(key, r.name.trim());
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
}

export async function listAvailableWeeks(campaignKey: string): Promise<{ month: string; week: number }[]> {
  const supabase = await createClient();
  // `week is not null` excludes the daily rows added in 0027 — those carry a
  // `date` instead and belong to the daily report, not this week picker.
  const [c, i, s] = await Promise.all([
    fetchAllRows<WeekRow>((from, to) =>
      supabase.from("contest_campaign_rows").select("month, week, raw_campaign_name").not("week", "is", null).range(from, to),
    ),
    fetchAllRows<WeekRow>((from, to) =>
      supabase.from("contest_inventory_rows").select("month, week, raw_campaign_name").not("week", "is", null).range(from, to),
    ),
    fetchAllRows<WeekRow>((from, to) =>
      supabase.from("contest_sell_side_rows").select("month, week, raw_campaign_name").not("week", "is", null).range(from, to),
    ),
  ]);
  const all = [...c, ...i, ...s];
  const seen = new Set<string>();
  const out: { month: string; week: number }[] = [];
  for (const r of all) {
    if (normalizeName(r.raw_campaign_name) !== campaignKey) continue;
    const month = (r.month as string).slice(0, 7);
    const k = `${month}-${r.week}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ month, week: r.week });
  }
  return out.sort((a, b) => (a.month + a.week < b.month + b.week ? 1 : -1));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function growthPct(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function pctRatio(numer: number, denom: number): number | null {
  if (denom === 0) return null;
  return (numer / denom) * 100;
}

type StoreBundle = {
  storeId: string;
  storeName: string;
  status: string | null;
  gmv: number | null;
  lastMonthGmv: number | null;
  lastYearGmv: number | null;
  penetration: number | null;
  lastMonthPenetration: number | null;
  lastYearPenetration: number | null;
  avgUnit: number | null;
  lastMonthAvgUnit: number | null;
  lastYearAvgUnit: number | null;
  categoryContribution: number | null;
  lastMonthCategoryContribution: number | null;
  lastYearCategoryContribution: number | null;
  storeStockFillRate: number | null;
  storeSkuOnTargetPct: number | null;
  warehouseStockFillRate: number | null;
  warehouseSkuOnTargetPct: number | null;
};

async function buildStoreBundles(campaignKey: string, month: string, week: number): Promise<StoreBundle[]> {
  const supabase = await createClient();
  const monthDate = `${month}-01`;

  // These three queries are scoped to one month+week but NOT to one campaign
  // (campaign matching happens below via normalizeName, since raw_campaign_name
  // is free text and several spellings can normalize to the same campaign).
  // That means a week where several campaigns report at once returns all of
  // their rows combined, and inventory is already per-SKU — 172 stores × even
  // a handful of SKUs clears PostgREST's 1000-row default. Without pagination
  // this doesn't error, it just drops rows past the cap and every median below
  // goes quietly wrong. fetchAllRows removes the cap.
  const [campaignRows, inventoryRows, sellRows] = await Promise.all([
    fetchAllRows<any>((from, to) =>
      supabase
        .from("contest_campaign_rows")
        .select("raw_campaign_name, store_id, status, stores ( name )")
        .eq("month", monthDate)
        .eq("week", week)
        .range(from, to),
    ),
    fetchAllRows<any>((from, to) =>
      supabase
        .from("contest_inventory_rows")
        .select(
          "raw_campaign_name, store_id, target_store_stock, in_store_stock, target_warehouse_stock, in_warehouse_stock, stores ( name )",
        )
        .eq("month", monthDate)
        .eq("week", week)
        .range(from, to),
    ),
    fetchAllRows<any>((from, to) =>
      supabase
        .from("contest_sell_side_rows")
        .select(
          `
          raw_campaign_name, store_id, stores ( name ),
          this_month_gmv, last_month_gmv, last_year_gmv,
          this_month_penetration, last_month_penetration, last_year_penetration,
          this_month_avg_unit, last_month_avg_unit, last_year_avg_unit,
          this_month_category_contribution, last_month_category_contribution, last_year_category_contribution
          `,
        )
        .eq("month", monthDate)
        .eq("week", week)
        .range(from, to),
    ),
  ]);

  const matchesCampaign = (name: string) => normalizeName(name) === campaignKey;

  const statusByStore = new Map<string, { status: string; storeName: string }>();
  for (const r of campaignRows) {
    if (!r.store_id || !matchesCampaign(r.raw_campaign_name)) continue;
    statusByStore.set(r.store_id, { status: r.status, storeName: r.stores?.name ?? "Unknown store" });
  }

  const invByStore = new Map<string, { skus: any[]; storeName: string }>();
  for (const r of inventoryRows) {
    if (!r.store_id || !matchesCampaign(r.raw_campaign_name)) continue;
    const entry = invByStore.get(r.store_id) ?? { skus: [] as any[], storeName: r.stores?.name ?? "Unknown store" };
    entry.skus.push(r);
    invByStore.set(r.store_id, entry);
  }

  const sellByStore = new Map<string, any>();
  for (const r of sellRows) {
    if (!r.store_id || !matchesCampaign(r.raw_campaign_name)) continue;
    sellByStore.set(r.store_id, r);
  }

  const storeIds = new Set<string>([...statusByStore.keys(), ...invByStore.keys(), ...sellByStore.keys()]);
  const bundles: StoreBundle[] = [];

  for (const storeId of storeIds) {
    const statusEntry = statusByStore.get(storeId);
    const invEntry = invByStore.get(storeId);
    const sell = sellByStore.get(storeId);

    let storeStockFillRate: number | null = null;
    let storeSkuOnTargetPct: number | null = null;
    let warehouseStockFillRate: number | null = null;
    let warehouseSkuOnTargetPct: number | null = null;
    if (invEntry) {
      let sumInStore = 0, sumTargetStore = 0, storeHits = 0, storeCounted = 0;
      let sumInWh = 0, sumTargetWh = 0, whHits = 0, whCounted = 0;
      for (const sku of invEntry.skus) {
        if (sku.in_store_stock != null && sku.target_store_stock != null) {
          sumInStore += sku.in_store_stock;
          sumTargetStore += sku.target_store_stock;
          storeCounted += 1;
          if (sku.in_store_stock >= sku.target_store_stock) storeHits += 1;
        }
        if (sku.in_warehouse_stock != null && sku.target_warehouse_stock != null) {
          sumInWh += sku.in_warehouse_stock;
          sumTargetWh += sku.target_warehouse_stock;
          whCounted += 1;
          if (sku.in_warehouse_stock >= sku.target_warehouse_stock) whHits += 1;
        }
      }
      storeStockFillRate = pctRatio(sumInStore, sumTargetStore);
      storeSkuOnTargetPct = storeCounted ? pctRatio(storeHits, storeCounted) : null;
      warehouseStockFillRate = pctRatio(sumInWh, sumTargetWh);
      warehouseSkuOnTargetPct = whCounted ? pctRatio(whHits, whCounted) : null;
    }

    bundles.push({
      storeId,
      storeName: statusEntry?.storeName ?? invEntry?.storeName ?? sell?.stores?.name ?? "Unknown store",
      status: statusEntry?.status ?? null,
      gmv: sell?.this_month_gmv ?? null,
      lastMonthGmv: sell?.last_month_gmv ?? null,
      lastYearGmv: sell?.last_year_gmv ?? null,
      penetration: sell?.this_month_penetration ?? null,
      lastMonthPenetration: sell?.last_month_penetration ?? null,
      lastYearPenetration: sell?.last_year_penetration ?? null,
      avgUnit: sell?.this_month_avg_unit ?? null,
      lastMonthAvgUnit: sell?.last_month_avg_unit ?? null,
      lastYearAvgUnit: sell?.last_year_avg_unit ?? null,
      categoryContribution: sell?.this_month_category_contribution ?? null,
      lastMonthCategoryContribution: sell?.last_month_category_contribution ?? null,
      lastYearCategoryContribution: sell?.last_year_category_contribution ?? null,
      storeStockFillRate,
      storeSkuOnTargetPct,
      warehouseStockFillRate,
      warehouseSkuOnTargetPct,
    });
  }

  return bundles;
}

function classify(bundle: StoreBundle): GroupKey {
  if (!bundle.status) return "not_configured";
  return APPROVED_STATUSES.has(normalizeName(bundle.status)) ? "approved" : "configured_not_approved";
}

export async function getWeekReport(campaignKey: string, month: string, week: number): Promise<WeekReport> {
  const bundles = await buildStoreBundles(campaignKey, month, week);

  const buckets: Record<GroupKey, StoreBundle[]> = { approved: [], configured_not_approved: [], not_configured: [] };
  const detail: Record<GroupKey, StoreDetailRow[]> = { approved: [], configured_not_approved: [], not_configured: [] };

  for (const b of bundles) {
    const group = classify(b);
    buckets[group].push(b);
    detail[group].push({
      storeId: b.storeId,
      storeName: b.storeName,
      status: b.status,
      gmv: b.gmv,
      gmvVsLastMonth: growthPct(b.gmv, b.lastMonthGmv),
      gmvVsLastYear: growthPct(b.gmv, b.lastYearGmv),
      storeStockFillRate: b.storeStockFillRate,
      warehouseStockFillRate: b.warehouseStockFillRate,
    });
  }

  const groups: GroupSummary[] = GROUP_ORDER.map((key) => {
    const rows = buckets[key];
    const num = (fn: (b: StoreBundle) => number | null) =>
      median(rows.map(fn).filter((v): v is number => v != null));
    return {
      key,
      count: rows.length,
      metrics: {
        gmvVsLastMonth: num((b) => growthPct(b.gmv, b.lastMonthGmv)),
        gmvVsLastYear: num((b) => growthPct(b.gmv, b.lastYearGmv)),
        penetrationVsLastMonth: num((b) => growthPct(b.penetration, b.lastMonthPenetration)),
        penetrationVsLastYear: num((b) => growthPct(b.penetration, b.lastYearPenetration)),
        avgUnitVsLastMonth: num((b) => growthPct(b.avgUnit, b.lastMonthAvgUnit)),
        avgUnitVsLastYear: num((b) => growthPct(b.avgUnit, b.lastYearAvgUnit)),
        categoryContributionVsLastMonth: num((b) => growthPct(b.categoryContribution, b.lastMonthCategoryContribution)),
        categoryContributionVsLastYear: num((b) => growthPct(b.categoryContribution, b.lastYearCategoryContribution)),
        storeStockFillRate: num((b) => b.storeStockFillRate),
        storeSkuOnTargetPct: num((b) => b.storeSkuOnTargetPct),
        warehouseStockFillRate: num((b) => b.warehouseStockFillRate),
        warehouseSkuOnTargetPct: num((b) => b.warehouseSkuOnTargetPct),
      },
    };
  });

  return { groups, detail };
}

export async function getMonthlyOverview(campaignKey: string, month: string): Promise<MonthlyOverview> {
  const allWeeks = await listAvailableWeeks(campaignKey);
  const weeksThisMonth = allWeeks.filter((w) => w.month === month).map((w) => w.week).sort((a, b) => a - b);

  const weeks: WeekTrendPoint[] = [];
  for (const week of weeksThisMonth) {
    const { groups } = await getWeekReport(campaignKey, month, week);
    const counts = {} as Record<GroupKey, number>;
    const byGroup = {} as WeekTrendPoint["byGroup"];
    for (const g of groups) {
      counts[g.key] = g.count;
      byGroup[g.key] = {
        gmvVsLastMonth: g.metrics.gmvVsLastMonth,
        penetrationVsLastMonth: g.metrics.penetrationVsLastMonth,
        avgUnitVsLastMonth: g.metrics.avgUnitVsLastMonth,
        categoryContributionVsLastMonth: g.metrics.categoryContributionVsLastMonth,
        storeStockFillRate: g.metrics.storeStockFillRate,
        warehouseStockFillRate: g.metrics.warehouseStockFillRate,
      };
    }
    weeks.push({ week, counts, byGroup });
  }
  return { weeks };
}

export async function hasAnyContestData(): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase.from("contest_data_batches").select("id", { count: "exact", head: true });
  return (count ?? 0) > 0;
}
