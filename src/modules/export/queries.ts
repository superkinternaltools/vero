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

/** Verdict resolution for payout purposes: a human reviewer's call is always
 * final. Only when no human verdict exists yet do we fall back to the AI's
 * score — and for tiered campaigns that means matching the AI's suggested
 * tier, not just a raw approved/rejected. If neither exists, or the AI's
 * score never landed inside a configured tier, the task is unresolved (no
 * payout) rather than silently guessed at. */
function resolveTaskVerdict(task: any, sub: any): Resolved {
  const tiers: any[] = task.campaigns?.payout_tiers ?? [];
  const isTiered = task.campaigns?.payout_model === "tiered";

  if (sub?.human_verdict) {
    if (sub.payout_tier_label) {
      const tier = tiers.find((tr) => tr.label === sub.payout_tier_label);
      if (tier) return { label: tier.label, pct: tier.pct };
    }
    return sub.human_verdict === "approved" ? { label: "Approved", pct: 100 } : { label: "Rejected", pct: 0 };
  }

  if (sub?.ai_verdict) {
    if (isTiered) {
      const tier = tiers.find((tr) => tr.label === sub.ai_verdict);
      if (tier) return { label: tier.label, pct: tier.pct };
      return { label: "AI score — no matching tier yet", pct: null };
    }
    return sub.ai_verdict === "approved" ? { label: "Approved", pct: 100 } : { label: "Rejected", pct: 0 };
  }

  return { label: STATUS_LABEL[task.status] ?? task.status, pct: null };
}

/** Payout/submission data spans every store — reads via the service-role
 * client so it's never scoped down by a viewer's own store/RLS. Groups tasks
 * by (campaign, store, week); a "week" can hold more than one task for a
 * daily-frequency campaign. */
export async function getExportGroups(month: string): Promise<ExportGroupRow[]> {
  const admin = createAdminClient();
  const { start, end } = monthRange(month);

  const { data: tasks } = await admin
    .from("tasks")
    .select(
      "id, campaign_id, store_id, due_date, status, stores ( code, name ), campaigns ( name, payout_enabled, payout_amount, payout_model, payout_tiers )",
    )
    .gte("due_date", start)
    .lte("due_date", end);

  const T = (tasks as any[]) ?? [];
  const taskIds = T.map((t) => t.id as string);

  const subByTask = new Map<string, any>();
  if (taskIds.length) {
    const { data: subs } = await admin
      .from("submissions")
      .select("task_id, human_verdict, ai_verdict, payout_tier_label, created_at")
      .in("task_id", taskIds)
      .order("created_at", { ascending: false });
    for (const s of (subs as any[]) ?? []) {
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
    taskCount: number;
    resolved: Resolved[];
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
        taskCount: 0,
        resolved: [],
      });
    }
    const g = groups.get(key)!;
    g.taskCount += 1;
    g.resolved.push(resolveTaskVerdict(t, subByTask.get(t.id)));
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
    };
  });

  rows.sort(
    (a, b) =>
      a.storeName.localeCompare(b.storeName) || a.week - b.week || a.campaignName.localeCompare(b.campaignName),
  );
  return rows;
}
