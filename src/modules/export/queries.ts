import { createClient } from "@/core/db/server";
import { createAdminClient } from "@/core/db/admin";
import type { CampaignOption, DepartmentOption, ExportGroupRow } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  missed: "Missed",
  not_done: "Not done",
};

/** Day-of-month chunking: week 1 = days 1–7 … week 5 = day 29–end of month.
 * Same convention as the Dashboard's week picker and Contest Impact. */
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

export async function listDepartmentOptions(): Promise<DepartmentOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("departments").select("id, name").order("name");
  return (data as DepartmentOption[]) ?? [];
}

export async function listCampaignOptions(): Promise<CampaignOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("id, name, status, campaign_departments ( department_id )")
    .is("deleted_at", null)
    .order("name");
  return ((data as any[]) ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    departmentIds: (c.campaign_departments ?? []).map((d: any) => d.department_id),
  }));
}

type Resolved = { label: string; pct: number | null };

/** Verdict resolution for payout purposes — mirrors summary-client.tsx's
 * cellDisplay(), the one place in the app already proven to show the right
 * tier per cell. Key insight taken from there: ai-review/score.ts writes the
 * matched tier's own label text into ai_verdict (not a raw score), so for
 * tiered campaigns the tier is looked up directly by name — never
 * recomputed from a numeric score.
 *
 * Tiered campaigns:
 *   1. Human explicitly picked a tier (payout_tier_label) — final.
 *   2. Human verdict but no tier on record (binary-style approve/reject even
 *      though the campaign is tiered) — generic full/zero.
 *   3. No human verdict yet, but AI scored it — ai_verdict already holds a
 *      tier label; matched directly against the tier table and counted as
 *      final (AI-only verdicts count the same as a human's, per instruction).
 *   4. Nothing at all yet — unresolved.
 *
 * Binary campaigns: human_verdict is final; ai_verdict is the fallback.
 */
function resolveTaskVerdict(task: any, sub: any): Resolved {
  const isTiered = task.campaigns?.payout_model === "tiered";
  const tiers: any[] = task.campaigns?.payout_tiers ?? [];

  if (isTiered) {
    if (sub?.human_verdict) {
      if (sub.payout_tier_label) {
        const tier = tiers.find((tr) => tr.label === sub.payout_tier_label);
        if (tier) return { label: tier.label, pct: tier.pct };
        return { label: sub.payout_tier_label, pct: null }; // recorded tier no longer in this campaign's config
      }
      return sub.human_verdict === "approved" ? { label: "Approved", pct: 100 } : { label: "Rejected", pct: 0 };
    }

    if (sub?.ai_verdict) {
      const tier = tiers.find((tr) => tr.label === sub.ai_verdict);
      if (tier) return { label: tier.label, pct: tier.pct };
      return sub.ai_verdict === "approved" ? { label: "Approved", pct: 100 } : { label: "Rejected", pct: 0 };
    }

    return { label: STATUS_LABEL[task.status] ?? task.status, pct: null };
  }

  if (sub?.human_verdict) {
    return sub.human_verdict === "approved" ? { label: "Approved", pct: 100 } : { label: "Rejected", pct: 0 };
  }
  if (sub?.ai_verdict) {
    return sub.ai_verdict === "approved" ? { label: "Approved", pct: 100 } : { label: "Rejected", pct: 0 };
  }
  return { label: STATUS_LABEL[task.status] ?? task.status, pct: null };
}

/** PostgREST caps a single .select() at 1000 rows — a whole month across
 * every store/campaign easily exceeds that, which silently truncated both
 * queries below (most submissions were missing, so payout looked ₹0 almost
 * everywhere). Pages through in batches until a short page signals the end. */
async function fetchAllRows(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
  pageSize = 1000,
): Promise<any[]> {
  const results: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) {
      // Surface it — a silently swallowed error here is exactly what made
      // "no submissions found" indistinguishable from "genuinely unreviewed".
      console.error("[export] query page failed:", error);
      break;
    }
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
  }
  return results;
}

/** Payout/submission data spans every store — reads via the service-role
 * client so it's never scoped down by a viewer's own store/RLS. Groups tasks
 * by (campaign, store, week); a "week" can hold more than one task for a
 * daily-frequency campaign. */
export async function getExportGroups(month: string): Promise<ExportGroupRow[]> {
  const admin = createAdminClient();
  const { start, end } = monthRange(month);

  const T = await fetchAllRows((from, to) =>
    admin
      .from("tasks")
      .select(
        "id, campaign_id, store_id, due_date, status, stores ( code, name ), campaigns ( name, payout_enabled, payout_amount, payout_model, payout_tiers )",
      )
      .gte("due_date", start)
      .lte("due_date", end)
      .order("id")
      .range(from, to),
  );
  // Filtering submissions by every individual task_id (thousands, for a
  // whole month across a whole chain) makes the .in() filter itself huge
  // enough to fail silently. Campaigns in scope are a far smaller set, so
  // filter by that instead and match back to tasks by task_id in JS.
  const campaignIds = [...new Set(T.map((t) => t.campaign_id as string))];

  const subByTask = new Map<string, any>();
  if (campaignIds.length) {
    const subs = await fetchAllRows((from, to) =>
      admin
        .from("submissions")
        .select("task_id, campaign_id, human_verdict, ai_verdict, payout_tier_label, reviewer_score, ai_score, created_at")
        .in("campaign_id", campaignIds)
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    for (const s of subs) {
      if (s.task_id && !subByTask.has(s.task_id)) subByTask.set(s.task_id, s);
    }
  }

  type Group = {
    campaignId: string;
    campaignName: string;
    storeCode: string;
    storeName: string;
    week: number;
    payoutEnabled: boolean;
    payoutAmount: number;
    payoutModel: string;
    taskCount: number;
    resolved: Resolved[];
    lastTask: any;
    lastSub: any;
  };
  const groups = new Map<string, Group>();

  for (const t of T) {
    const week = weekOfMonth(t.due_date);
    const key = `${t.campaign_id}|${t.store_id}|${week}`;
    if (!groups.has(key)) {
      groups.set(key, {
        campaignId: t.campaign_id,
        campaignName: t.campaigns?.name ?? "—",
        storeCode: t.stores?.code ?? "—",
        storeName: t.stores?.name ?? "—",
        week,
        payoutEnabled: t.campaigns?.payout_enabled ?? false,
        payoutAmount: Number(t.campaigns?.payout_amount ?? 0),
        payoutModel: t.campaigns?.payout_model ?? "binary",
        taskCount: 0,
        resolved: [],
        lastTask: null,
        lastSub: null,
      });
    }
    const g = groups.get(key)!;
    g.taskCount += 1;
    const sub = subByTask.get(t.id);
    g.resolved.push(resolveTaskVerdict(t, sub));
    g.lastTask = t;
    g.lastSub = sub;
  }

  const rows: ExportGroupRow[] = [...groups.values()].map((g) => {
    const actualPayout = g.payoutEnabled
      ? g.resolved.reduce((sum, r) => sum + (r.pct != null ? (r.pct / 100) * g.payoutAmount : 0), 0)
      : 0;
    // Best case for the week — every assigned task resolved at the full rate.
    const expectedPayout = g.payoutEnabled ? g.taskCount * g.payoutAmount : 0;
    const approvedCount = g.resolved.filter((r) => (r.pct ?? 0) > 0).length;

    let statusSummary: string;
    if (g.resolved.length === 1) {
      statusSummary = g.resolved[0].label;
    } else {
      const counts = new Map<string, number>();
      for (const r of g.resolved) counts.set(r.label, (counts.get(r.label) ?? 0) + 1);
      statusSummary = [...counts.entries()].map(([label, n]) => `${label} (${n})`).join(", ");
    }

    const single = g.taskCount === 1;
    return {
      campaignId: g.campaignId,
      campaignName: g.campaignName,
      storeCode: g.storeCode,
      storeName: g.storeName,
      month,
      week: g.week,
      assignedCount: g.taskCount,
      approvedCount,
      statusSummary,
      expectedPayout,
      actualPayout,
      payoutModel: g.payoutModel,
      taskStatus: single ? g.lastTask.status : null,
      hasSubmission: single ? g.lastSub != null : null,
      reviewerScore: single ? (g.lastSub?.reviewer_score ?? null) : null,
      aiScore: single ? (g.lastSub?.ai_score ?? null) : null,
      recordedTierLabel: single ? (g.lastSub?.payout_tier_label ?? null) : null,
    };
  });

  rows.sort(
    (a, b) =>
      a.storeName.localeCompare(b.storeName) || a.week - b.week || a.campaignName.localeCompare(b.campaignName),
  );
  return rows;
}
