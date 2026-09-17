import { createClient } from "@/core/db/server";
import type { CampaignEarnings, StoreEarningsSummary, StoreOption, SubmissionDetail, SubmissionVerdict, WeekDetail } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Every store this person can see earnings for — every store if admin,
 * otherwise only the ones they're linked to via user_stores (the same
 * linkage a Store Partner or SAE already has for tasks/review). */
export async function listStoresForUser(userId: string, isAdmin: boolean): Promise<StoreOption[]> {
  const supabase = await createClient();

  if (isAdmin) {
    const { data } = await supabase.from("stores").select("id, name").is("deleted_at", null).order("name");
    return ((data as any[]) ?? []).map((s) => ({ id: s.id, name: s.name }));
  }

  const { data } = await supabase
    .from("user_stores")
    .select("stores ( id, name, deleted_at )")
    .eq("user_id", userId);
  return ((data as any[]) ?? [])
    .map((r) => r.stores)
    .filter((s) => s && !s.deleted_at)
    .map((s) => ({ id: s.id, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** PostgREST caps an unpaginated select at 1000 rows — page through until a
 * short page signals the end, same pattern used across the app's other
 * whole-month queries (export, contest-impact). */
async function fetchAllRows(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
  pageSize = 1000,
): Promise<any[]> {
  const results: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
  }
  return results;
}

/** Same day-of-month chunking used by Export, Dashboard and Contest Impact —
 * week 1 = days 1-7 … week 5 = day 29 to end of month. */
function weekOfMonth(dateISO: string): number {
  const day = Number(dateISO.slice(8, 10));
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  if (day <= 28) return 4;
  return 5;
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start: `${month}-01`, end };
}

export function previousMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Resolves one task+submission into a payout outcome — mirrors the export
 * module's resolveTaskVerdict() (src/modules/export/queries.ts), the
 * existing source of truth for this. Kept as its own copy per this
 * codebase's module-isolation convention (no cross-module imports), but the
 * rule itself must stay identical:
 *   - A human verdict always wins when present (tier pick, or plain
 *     approve/reject for a binary-style call on a tiered campaign).
 *   - Otherwise the AI's verdict is used AS-IS and already counts toward
 *     payout — this is not a "pending, not yet counted" state. humanReviewed
 *     just tracks whether a person has since confirmed it.
 *   - Only a task with neither verdict yet is "unscored" (amount 0).
 * Nothing here should diverge from that copy. */
function resolveSubmission(
  task: any,
  sub: any,
): { verdict: SubmissionVerdict; humanReviewed: boolean; tierLabel: string | null; pct: number | null; amount: number } {
  const payoutEnabled = task.campaigns?.payout_enabled ?? false;
  const payoutAmount = Number(task.campaigns?.payout_amount ?? 0);
  const isTiered = task.campaigns?.payout_model === "tiered";
  const tiers: any[] = task.campaigns?.payout_tiers ?? [];

  const resolve = (tierLabel: string | null, pct: number | null, humanReviewed: boolean) => {
    const verdict: SubmissionVerdict = pct == null ? "unscored" : pct > 0 ? "approved" : "rejected";
    const amount = payoutEnabled && pct != null ? (pct / 100) * payoutAmount : 0;
    return { verdict, humanReviewed, tierLabel, pct, amount };
  };
  const unscored = { verdict: "unscored" as const, humanReviewed: false, tierLabel: null, pct: null, amount: 0 };

  if (isTiered) {
    if (sub?.human_verdict) {
      if (sub.payout_tier_label) {
        const tier = tiers.find((t) => t.label === sub.payout_tier_label);
        return resolve(sub.payout_tier_label, tier ? tier.pct : null, true);
      }
      return resolve(null, sub.human_verdict === "approved" ? 100 : 0, true);
    }
    if (sub?.ai_verdict) {
      const tier = tiers.find((t) => t.label === sub.ai_verdict);
      if (tier) return resolve(tier.label, tier.pct, false);
      return resolve(null, sub.ai_verdict === "approved" ? 100 : 0, false);
    }
    return unscored;
  }

  if (sub?.human_verdict) return resolve(null, sub.human_verdict === "approved" ? 100 : 0, true);
  if (sub?.ai_verdict) return resolve(null, sub.ai_verdict === "approved" ? 100 : 0, false);
  return unscored;
}

async function computeStoreTotal(storeId: string, month: string): Promise<number> {
  const supabase = await createClient();
  const { start, end } = monthRange(month);
  const tasks = await fetchAllRows((from, to) =>
    supabase
      .from("tasks")
      .select("id, campaigns ( payout_enabled, payout_amount, payout_model, payout_tiers )")
      .eq("store_id", storeId)
      .gte("due_date", start)
      .lte("due_date", end)
      .range(from, to),
  );
  if (!tasks.length) return 0;
  const taskIds = tasks.map((t) => t.id);
  const subs = await fetchAllRows((from, to) =>
    supabase
      .from("submissions")
      .select("task_id, human_verdict, ai_verdict, payout_tier_label")
      .in("task_id", taskIds)
      .range(from, to),
  );
  const subByTask = new Map<string, any>();
  for (const s of subs) if (s.task_id && !subByTask.has(s.task_id)) subByTask.set(s.task_id, s);
  return tasks.reduce((sum, t) => sum + resolveSubmission(t, subByTask.get(t.id)).amount, 0);
}

/** Full campaign-by-campaign, week-by-week earnings breakdown for one store,
 * one month — the data behind the Store Earnings page. */
export async function getStoreEarnings(storeId: string, month: string): Promise<StoreEarningsSummary | null> {
  const supabase = await createClient();
  const { start, end } = monthRange(month);

  const { data: store } = await supabase.from("stores").select("id, name").eq("id", storeId).is("deleted_at", null).maybeSingle();
  if (!store) return null;

  const tasks = await fetchAllRows((from, to) =>
    supabase
      .from("tasks")
      .select("id, campaign_id, due_date, status, campaigns ( name, payout_enabled, payout_amount, payout_model, payout_tiers )")
      .eq("store_id", storeId)
      .gte("due_date", start)
      .lte("due_date", end)
      .order("due_date")
      .range(from, to),
  );

  const taskIds = tasks.map((t) => t.id);
  const subByTask = new Map<string, any>();
  if (taskIds.length) {
    const subs = await fetchAllRows((from, to) =>
      supabase
        .from("submissions")
        .select("task_id, human_verdict, ai_verdict, payout_tier_label, ai_score, rejection_reason, photos, created_at")
        .in("task_id", taskIds)
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    for (const s of subs) if (s.task_id && !subByTask.has(s.task_id)) subByTask.set(s.task_id, s);
  }

  const byCampaign = new Map<string, { name: string; payoutModel: string; payoutAmount: number; weeks: Map<number, WeekDetail> }>();
  let maxWeek = 0;

  for (const t of tasks) {
    const week = weekOfMonth(t.due_date);
    maxWeek = Math.max(maxWeek, week);
    const campaignId = t.campaign_id as string;
    if (!byCampaign.has(campaignId)) {
      byCampaign.set(campaignId, {
        name: t.campaigns?.name ?? "—",
        payoutModel: t.campaigns?.payout_model ?? "binary",
        payoutAmount: Number(t.campaigns?.payout_amount ?? 0),
        weeks: new Map(),
      });
    }
    const camp = byCampaign.get(campaignId)!;
    if (!camp.weeks.has(week)) camp.weeks.set(week, { week, amount: 0, submissions: [] });
    const weekDetail = camp.weeks.get(week)!;

    const sub = subByTask.get(t.id);
    const resolved = resolveSubmission(t, sub);
    const detail: SubmissionDetail = {
      dueDate: t.due_date,
      verdict: resolved.verdict,
      humanReviewed: resolved.humanReviewed,
      tierLabel: resolved.tierLabel,
      pct: resolved.pct,
      amount: resolved.amount,
      aiScore: sub?.ai_score ?? null,
      rejectionReason: sub?.rejection_reason ?? null,
      photos: sub?.photos ?? [],
    };
    weekDetail.submissions.push(detail);
    weekDetail.amount += detail.amount;
  }

  const campaigns: CampaignEarnings[] = [...byCampaign.entries()].map(([campaignId, c]) => {
    const weeks = Array.from({ length: maxWeek }, (_, i) => c.weeks.get(i + 1) ?? { week: i + 1, amount: 0, submissions: [] });
    return {
      campaignId,
      name: c.name,
      payoutModel: c.payoutModel,
      payoutAmount: c.payoutAmount,
      total: weeks.reduce((sum, w) => sum + w.amount, 0),
      weeks,
    };
  });
  campaigns.sort((a, b) => b.total - a.total);

  const weeklyTotals = Array.from({ length: maxWeek }, (_, i) => campaigns.reduce((sum, c) => sum + (c.weeks[i]?.amount ?? 0), 0));
  const total = campaigns.reduce((sum, c) => sum + c.total, 0);
  const lastMonthTotal = await computeStoreTotal(storeId, previousMonthKey(month));

  return {
    storeId,
    storeName: (store as any).name,
    month,
    total,
    lastMonthTotal,
    weekCount: maxWeek,
    weeklyTotals,
    campaigns,
  };
}
