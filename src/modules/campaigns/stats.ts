import { createClient } from "@/core/db/server";
import { createAdminClient } from "@/core/db/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Health = "on_track" | "needs_attention" | "critical" | "no_data";

export type CampaignHealthRow = {
  id: string;
  name: string;
  frequency: string;
  status: string;
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
  // per-status counts for the week window
  weekPending: number;
  weekSubmittedOnly: number;
  weekApproved: number;
  weekRejected: number;
  weekNotDone: number;
  // per-status counts for the month window
  monthPending: number;
  monthSubmittedOnly: number;
  monthApproved: number;
  monthRejected: number;
  monthNotDone: number;
  nonRejectionPct: number;
  reviewedCount: number;
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

/** Fetches all rows from a paginated Supabase query, bypassing the default 1000-row cap. */
async function fetchAllRows(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
  pageSize = 1000,
): Promise<any[]> {
  const results: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
  }
  return results;
}

export async function getCampaignHealthRows(): Promise<CampaignHealthRow[]> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const t = await getThresholds();
  const { weekStart, weekEnd } = currentWeekWindow();
  const { monthStart, monthEnd } = currentMonthWindow();

  const [{ data: campaigns }, tasks, subs] = await Promise.all([
    supabase
      .from("campaigns")
      .select(
        "id, name, frequency, status, start_date, end_date, payout_enabled, payout_amount, execution_types ( name ), campaign_departments ( departments ( name ) ), campaign_stores ( store_id )",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    fetchAllRows((from, to) =>
      admin
        .from("tasks")
        .select("campaign_id, status, due_date")
        .gte("due_date", monthStart)
        .lte("due_date", monthEnd)
        .order("campaign_id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      admin
        .from("submissions")
        .select("campaign_id, human_verdict, status")
        .range(from, to),
    ),
  ]);

  const T = tasks;
  const S = subs;
  const SUBMITTED = ["submitted", "approved", "rejected"];

  return ((campaigns as any[]) ?? []).map((c) => {
    const ct = T.filter((x) => x.campaign_id === c.id);
    const cs = S.filter((x) => x.campaign_id === c.id);

    const weekTasks = ct.filter((x) => x.due_date >= weekStart && x.due_date <= weekEnd);
    const monthTasks = ct.filter((x) => x.due_date >= monthStart && x.due_date <= monthEnd);

    const weekSubmitted = weekTasks.filter((x) => SUBMITTED.includes(x.status)).length;
    const monthSubmitted = monthTasks.filter((x) => SUBMITTED.includes(x.status)).length;

    const weekPending = weekTasks.filter((x) => x.status === "pending").length;
    const weekSubmittedOnly = weekTasks.filter((x) => x.status === "submitted").length;
    const weekApproved = weekTasks.filter((x) => x.status === "approved").length;
    const weekRejected = weekTasks.filter((x) => x.status === "rejected").length;
    const weekNotDone = weekTasks.filter((x) => x.status === "not_done").length;

    const monthPending = monthTasks.filter((x) => x.status === "pending").length;
    const monthSubmittedOnly = monthTasks.filter((x) => x.status === "submitted").length;
    const monthApproved = monthTasks.filter((x) => x.status === "approved").length;
    const monthRejected = monthTasks.filter((x) => x.status === "rejected").length;
    const monthNotDone = monthTasks.filter((x) => x.status === "not_done").length;

    const reviewed = cs.filter((x) => x.human_verdict).length;
    const rejected = cs.filter((x) => x.human_verdict === "rejected").length;
    const approvedCycles = ct.filter((x) => x.status === "approved").length;

    // For weekly/monthly campaigns each store has exactly 1 task per window —
    // use the number of assigned stores as the authoritative denominator so that
    // a missing task-generation run doesn't silently lower the %.
    // For daily campaigns tasks stack up (1 per store per day), so fall back to
    // actual task count which is accurate once generation has run.
    const storeCount = (c.campaign_stores ?? []).length;
    const isDaily = c.frequency === "daily";
    const weekDenominator = isDaily ? weekTasks.length : storeCount;
    const monthDenominator = isDaily ? monthTasks.length : storeCount;

    const submissionPctWeek = pct(weekSubmitted, weekDenominator);
    const submissionPctMonth = pct(monthSubmitted, monthDenominator);

    // Use actual task existence in the window to decide whether to show No Data.
    // For monthly campaigns, tasks are only due on the last day of the month —
    // so the week window will correctly show No Data until that day arrives.
    const weekHasTasks = weekTasks.length > 0;
    const monthHasTasks = monthTasks.length > 0;

    return {
      id: c.id,
      name: c.name,
      frequency: c.frequency,
      status: c.status ?? "active",
      executionTypeName: c.execution_types?.name ?? null,
      departmentNames: (c.campaign_departments ?? [])
        .map((d: any) => d.departments?.name)
        .filter(Boolean),
      startDate: c.start_date ?? null,
      endDate: c.end_date ?? null,
      submissionPctWeek,
      submissionPctMonth,
      weekSubmitted,
      weekTotal: weekDenominator,
      monthSubmitted,
      monthTotal: monthDenominator,
      weekPending,
      weekSubmittedOnly,
      weekApproved,
      weekRejected,
      weekNotDone,
      monthPending,
      monthSubmittedOnly,
      monthApproved,
      monthRejected,
      monthNotDone,
      nonRejectionPct: pct(reviewed - rejected, reviewed),
      reviewedCount: reviewed,
      payoutCommitted: c.payout_enabled ? approvedCycles * Number(c.payout_amount) : 0,
      healthWeek: healthOf(submissionPctWeek, weekHasTasks, t),
      healthMonth: healthOf(submissionPctMonth, monthHasTasks, t),
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
