import { createClient } from "@/core/db/server";
import { createAdminClient } from "@/core/db/admin";
import type {
  NameOption,
  WeekOption,
  ContestImpactReport,
  GroupKey,
  GroupSummary,
  StoreDetailRow,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function listCampaignOptions(): Promise<NameOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  return ((data as any[]) ?? []).map((c) => ({ id: c.id, label: c.name }));
}

export async function listStoreOptions(): Promise<NameOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stores")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  return ((data as any[]) ?? []).map((s) => ({ id: s.id, label: s.name }));
}

/** Builds normalized-name → id maps from live records plus every saved alias. */
export async function buildNameResolvers(): Promise<{
  byCampaignName: Map<string, string>;
  byStoreName: Map<string, string>;
}> {
  const supabase = await createClient();
  const [{ data: campaigns }, { data: stores }, { data: campaignAliases }, { data: storeAliases }] =
    await Promise.all([
      supabase.from("campaigns").select("id, name").is("deleted_at", null),
      supabase.from("stores").select("id, name").is("deleted_at", null),
      supabase.from("campaign_name_aliases").select("raw_name, campaign_id"),
      supabase.from("store_name_aliases").select("raw_name, store_id"),
    ]);

  const byCampaignName = new Map<string, string>();
  for (const c of (campaigns as any[]) ?? []) byCampaignName.set(normalizeName(c.name), c.id);
  for (const a of (campaignAliases as any[]) ?? []) byCampaignName.set(normalizeName(a.raw_name), a.campaign_id);

  const byStoreName = new Map<string, string>();
  for (const s of (stores as any[]) ?? []) byStoreName.set(normalizeName(s.name), s.id);
  for (const a of (storeAliases as any[]) ?? []) byStoreName.set(normalizeName(a.raw_name), a.store_id);

  return { byCampaignName, byStoreName };
}

/** Day-of-month chunking: week 1 = days 1–7 … week 5 = day 29–end of month. */
export function getWeekRange(month: string, weekOfMonth: number): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const startDay = (weekOfMonth - 1) * 7 + 1;
  const endDay = Math.min(startDay + 6, daysInMonth);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${month}-${pad(startDay)}`,
    end: `${month}-${pad(endDay)}`,
  };
}

export async function listImportedWeeks(campaignId: string): Promise<WeekOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("store_weekly_performance")
    .select("month, week_of_month")
    .eq("campaign_id", campaignId);

  const seen = new Set<string>();
  const weeks: WeekOption[] = [];
  for (const r of (data as any[]) ?? []) {
    const month = (r.month as string).slice(0, 7);
    const key = `${month}-${r.week_of_month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    weeks.push({ month, weekOfMonth: r.week_of_month, label: `${label} · Week ${r.week_of_month}` });
  }
  return weeks.sort((a, b) => (a.month + a.weekOfMonth < b.month + b.weekOfMonth ? 1 : -1));
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

const TASK_STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  rejected: "Rejected",
  missed: "Missed",
  not_done: "Not done",
  submitted: "Not reviewed",
  pending: "No submission",
};

export async function getContestImpactReport(
  campaignId: string,
  month: string,
  weekOfMonth: number,
): Promise<ContestImpactReport> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { start, end } = getWeekRange(month, weekOfMonth);
  const weekClosed = end < new Date().toISOString().slice(0, 10);

  const { data: perfRows } = await supabase
    .from("store_weekly_performance")
    .select(
      `
      store_id, stores ( name ),
      this_month_gmv, last_month_gmv, last_year_gmv,
      this_month_penetration, last_month_penetration, last_year_penetration,
      this_month_avg_unit, last_month_avg_unit, last_year_avg_unit,
      this_month_category_contribution, last_month_category_contribution, last_year_category_contribution
      `,
    )
    .eq("campaign_id", campaignId)
    .eq("month", `${month}-01`)
    .eq("week_of_month", weekOfMonth)
    .not("store_id", "is", null);

  const { data: taskRows } = await admin
    .from("tasks")
    .select("store_id, status, cycle_start, cycle_end")
    .eq("campaign_id", campaignId)
    .lte("cycle_start", end)
    .gte("cycle_end", start);

  const tasksByStore = new Map<string, { status: string }[]>();
  for (const t of (taskRows as any[]) ?? []) {
    const list = tasksByStore.get(t.store_id) ?? [];
    list.push({ status: t.status });
    tasksByStore.set(t.store_id, list);
  }

  const buckets: Record<GroupKey, any[]> = { approved: [], configured_not_approved: [], not_configured: [] };
  const detail: Record<GroupKey, StoreDetailRow[]> = { approved: [], configured_not_approved: [], not_configured: [] };
  let excludedPendingCount = 0;

  for (const r of (perfRows as any[]) ?? []) {
    const storeId = r.store_id as string;
    const storeName = r.stores?.name ?? "Unknown store";
    const tasksForStore = tasksByStore.get(storeId) ?? [];
    const approvedTask = tasksForStore.find((t) => t.status === "approved");
    const anyTask = tasksForStore[0];

    let group: GroupKey;
    if (approvedTask) {
      group = "approved";
    } else if (anyTask && weekClosed) {
      group = "configured_not_approved";
    } else if (anyTask && !weekClosed) {
      excludedPendingCount += 1;
      continue;
    } else {
      group = "not_configured";
    }

    buckets[group].push(r);
    const verdictLabel = approvedTask
      ? "Approved"
      : anyTask
        ? (TASK_STATUS_LABEL[anyTask.status] ?? anyTask.status)
        : "No contest";
    detail[group].push({
      storeId,
      storeName,
      gmv: r.this_month_gmv,
      gmvVsLastMonth: growthPct(r.this_month_gmv, r.last_month_gmv),
      gmvVsLastYear: growthPct(r.this_month_gmv, r.last_year_gmv),
      penetration: r.this_month_penetration,
      verdictLabel,
    });
  }

  const groups: GroupSummary[] = (["approved", "configured_not_approved", "not_configured"] as GroupKey[]).map(
    (key) => {
      const rows = buckets[key];
      return {
        key,
        count: rows.length,
        medianGmvVsLastMonth: median(rows.map((r) => growthPct(r.this_month_gmv, r.last_month_gmv)).filter((v): v is number => v != null)),
        medianGmvVsLastYear: median(rows.map((r) => growthPct(r.this_month_gmv, r.last_year_gmv)).filter((v): v is number => v != null)),
        medianPenetrationVsLastMonth: median(rows.map((r) => growthPct(r.this_month_penetration, r.last_month_penetration)).filter((v): v is number => v != null)),
        medianPenetrationVsLastYear: median(rows.map((r) => growthPct(r.this_month_penetration, r.last_year_penetration)).filter((v): v is number => v != null)),
        medianAvgUnitVsLastMonth: median(rows.map((r) => growthPct(r.this_month_avg_unit, r.last_month_avg_unit)).filter((v): v is number => v != null)),
        medianAvgUnitVsLastYear: median(rows.map((r) => growthPct(r.this_month_avg_unit, r.last_year_avg_unit)).filter((v): v is number => v != null)),
        medianCategoryContributionVsLastMonth: median(rows.map((r) => growthPct(r.this_month_category_contribution, r.last_month_category_contribution)).filter((v): v is number => v != null)),
        medianCategoryContributionVsLastYear: median(rows.map((r) => growthPct(r.this_month_category_contribution, r.last_year_category_contribution)).filter((v): v is number => v != null)),
      };
    },
  );

  return { groups, detail, excludedPendingCount };
}
