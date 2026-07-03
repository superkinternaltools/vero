import { createClient } from "@/core/db/server";
import { createAdminClient } from "@/core/db/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Health = "on_track" | "needs_attention" | "critical" | "no_data";

export type CampaignHealthRow = {
  id: string;
  name: string;
  executionTypeName: string | null;
  departmentNames: string[];
  startDate: string | null;
  endDate: string | null;
  submissionPctWeek: number;
  submissionPctMonth: number;
  weekSubmitted: number;
  weekTotal: number;
  monthSubmitted: number;
  monthTotal: number;
  nonRejectionPct: number;
  payoutCommitted: number;
  healthWeek: Health;
  healthMonth: Health;
};

export type StoreBreakdownRow = {
  storeName: string;
  assigned: number;
  submitted: number;
  approved: number;
  submissionPct: number;
};

export type CampaignDeepStats = {
  id: string;
  name: string;
  executionTypeName: string | null;
  frequency: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  health: Health;
  healthReason: string;
  submissionPct: number;
  nonRejectionPct: number;
  approvalPct: number;
  missedPct: number;
  payoutCommitted: number;
  stores: StoreBreakdownRow[];
  topRejectionReasons: { name: string; count: number }[];
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

async function getThresholds() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["health_on_track", "health_needs_attention"]);
  const map = new Map(((data as any[]) ?? []).map((r) => [r.key, Number(r.value)]));
  return {
    onTrack: map.get("health_on_track") ?? 80,
    needs: map.get("health_needs_attention") ?? 50,
  };
}

function healthOf(submissionPct: number, hasTasks: boolean, t: { onTrack: number; needs: number }): Health {
  if (!hasTasks) return "no_data";
  if (submissionPct >= t.onTrack) return "on_track";
  if (submissionPct >= t.needs) return "needs_attention";
  return "critical";
}

function localDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function currentWeekWindow(): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const day = now.getDate();
  const weekNum = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
  const startDay = (weekNum - 1) * 7 + 1;
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const endDay = weekNum === 4 ? lastOfMonth : weekNum * 7;
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    weekStart: localDateStr(y, m, startDay),
    weekEnd: localDateStr(y, m, endDay),
  };
}

function currentMonthWindow(): { monthStart: string; monthEnd: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const lastOfMonth = new Date(y, m + 1, 0).getDate();
  return {
    monthStart: localDateStr(y, m, 1),
    monthEnd: localDateStr(y, m, lastOfMonth),
  };
}

export async function getCampaignHealthRows(): Promise<CampaignHealthRow[]> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const t = await getThresholds();
  const { weekStart, weekEnd } = currentWeekWindow();
  const { monthStart, monthEnd } = currentMonthWindow();

  const [{ data: campaigns }, { data: tasks }, { data: subs }] = await Promise.all([
    supabase
      .from("campaigns")
      .select(
        "id, name, start_date, end_date, payout_enabled, payout_amount, execution_types ( name ), campaign_departments ( departments ( name ) )",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    admin
      .from("tasks")
      .select("campaign_id, status, due_date")
      .gte("due_date", monthStart)
      .lte("due_date", monthEnd)
      .limit(10000),
    admin.from("submissions").select("campaign_id, human_verdict, status").limit(10000),
  ]);

  const T = (tasks as any[]) ?? [];
  const S = (subs as any[]) ?? [];
  const SUBMITTED = ["submitted", "approved", "rejected"];

  return ((campaigns as any[]) ?? []).map((c) => {
    const ct = T.filter((x) => x.campaign_id === c.id);
    const cs = S.filter((x) => x.campaign_id === c.id);

    const weekTasks = ct.filter((x) => x.due_date >= weekStart && x.due_date <= weekEnd);
    const monthTasks = ct.filter((x) => x.due_date >= monthStart && x.due_date <= monthEnd);

    const weekSubmitted = weekTasks.filter((x) => SUBMITTED.includes(x.status)).length;
    const monthSubmitted = monthTasks.filter((x) => SUBMITTED.includes(x.status)).length;

    const reviewed = cs.filter((x) => x.human_verdict).length;
    const rejected = cs.filter((x) => x.human_verdict === "rejected").length;
    const approvedCycles = ct.filter((x) => x.status === "approved").length;

    const submissionPctWeek = pct(weekSubmitted, weekTasks.length);
    const submissionPctMonth = pct(monthSubmitted, monthTasks.length);

    return {
      id: c.id,
      name: c.name,
      executionTypeName: c.execution_types?.name ?? null,
      departmentNames: (c.campaign_departments ?? [])
        .map((d: any) => d.departments?.name)
        .filter(Boolean),
      startDate: c.start_date ?? null,
      endDate: c.end_date ?? null,
      submissionPctWeek,
      submissionPctMonth,
      weekSubmitted,
      weekTotal: weekTasks.length,
      monthSubmitted,
      monthTotal: monthTasks.length,
      nonRejectionPct: pct(reviewed - rejected, reviewed),
      payoutCommitted: c.payout_enabled ? approvedCycles * Number(c.payout_amount) : 0,
      healthWeek: healthOf(submissionPctWeek, weekTasks.length > 0, t),
      healthMonth: healthOf(submissionPctMonth, monthTasks.length > 0, t),
    };
  });
}

export async function getCampaignDeepStats(id: string): Promise<CampaignDeepStats | null> {
  const supabase = await createClient();
  const t = await getThresholds();

  const { data: c } = await supabase
    .from("campaigns")
    .select(
      "id, name, frequency, status, start_date, end_date, payout_enabled, payout_amount, execution_types ( name )",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!c) return null;

  const [{ data: tasks }, { data: subs }] = await Promise.all([
    supabase.from("tasks").select("store_id, status, stores ( name )").eq("campaign_id", id),
    supabase
      .from("submissions")
      .select("human_verdict, rejection_reason, status")
      .eq("campaign_id", id),
  ]);

  const T = (tasks as any[]) ?? [];
  const S = (subs as any[]) ?? [];

  const assigned = T.length;
  const submitted = T.filter((x) => ["submitted", "approved", "rejected"].includes(x.status)).length;
  const approved = T.filter((x) => x.status === "approved").length;
  const missed = T.filter((x) => x.status === "missed" || x.status === "not_done").length;
  const reviewed = S.filter((x) => x.human_verdict).length;
  const rejected = S.filter((x) => x.human_verdict === "rejected").length;

  const submissionPct = pct(submitted, assigned);
  const health = healthOf(submissionPct, assigned > 0, t);
  const healthReason =
    health === "no_data"
      ? "No tasks generated yet."
      : health === "on_track"
        ? `Submission ${submissionPct}% ≥ ${t.onTrack}% threshold.`
        : health === "needs_attention"
          ? `Submission ${submissionPct}% is below the ${t.onTrack}% On-Track threshold.`
          : `Submission ${submissionPct}% is below the ${t.needs}% Needs-Attention threshold.`;

  // per-store breakdown
  const storeMap = new Map<string, { storeName: string; assigned: number; submitted: number; approved: number }>();
  for (const x of T) {
    const m = storeMap.get(x.store_id) ?? {
      storeName: x.stores?.name ?? "—",
      assigned: 0,
      submitted: 0,
      approved: 0,
    };
    m.assigned += 1;
    if (["submitted", "approved", "rejected"].includes(x.status)) m.submitted += 1;
    if (x.status === "approved") m.approved += 1;
    storeMap.set(x.store_id, m);
  }
  const stores: StoreBreakdownRow[] = [...storeMap.values()]
    .map((m) => ({ ...m, submissionPct: pct(m.submitted, m.assigned) }))
    .sort((a, b) => a.submissionPct - b.submissionPct);

  // top rejection reasons
  const reasonCounts = new Map<string, number>();
  for (const s of S)
    if (s.human_verdict === "rejected" && s.rejection_reason)
      reasonCounts.set(s.rejection_reason, (reasonCounts.get(s.rejection_reason) ?? 0) + 1);
  const topRejectionReasons = [...reasonCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const row = c as any;
  return {
    id: row.id,
    name: row.name,
    executionTypeName: row.execution_types?.name ?? null,
    frequency: row.frequency,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    health,
    healthReason,
    submissionPct,
    nonRejectionPct: pct(reviewed - rejected, reviewed),
    approvalPct: pct(approved, submitted),
    missedPct: pct(missed, assigned),
    payoutCommitted: row.payout_enabled ? approved * Number(row.payout_amount) : 0,
    stores,
    topRejectionReasons,
  };
}
