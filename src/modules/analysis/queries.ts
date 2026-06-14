import { createClient } from "@/core/db/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AnalysisThresholds = { onTrack: number; needs: number };

export type OverviewTotals = {
  assigned: number;
  submitted: number;
  approved: number;
  missed: number;
  submissionPct: number;
  approvalPct: number;
  missedPct: number;
  payoutCommitted: number;
};

export type CampaignOverviewRow = {
  id: string;
  name: string;
  assigned: number;
  submissionPct: number;
  approvedPct: number;
  missedPct: number;
  payout: number;
};

export type TrendPoint = {
  label: string;
  submissionPct: number;
  approvalPct: number;
  assigned: number;
};

export type TrendSeries = {
  campaignId: string;
  campaignName: string;
  points: TrendPoint[];
};

export type StoreAnalysisRow = {
  id: string;
  name: string;
  assigned: number;
  submitted: number;
  submissionPct: number;
  approvedPct: number;
  missed: number;
};

export type PersonAnalysisRow = {
  userId: string;
  name: string;
  assigned: number;
  done: number;
  completionPct: number;
  approved: number;
  approvedPct: number;
  missed: number;
};

export type AiAnalysisData = {
  totalSubmissions: number;
  reviewed: number;
  agreed: number;
  aiApprovedHumanRejected: number;
  aiRejectedHumanApproved: number;
  overrideRate: number;
  missingAi: number;
  rejectionReasons: { name: string; count: number }[];
  byCampaign: {
    id: string;
    name: string;
    reviewed: number;
    aiPassRate: number;
    overrideRate: number;
    missing: number;
  }[];
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

function isoWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7,
  );
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function monthLabel(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function fmtBucketLabel(label: string, gran: "weekly" | "monthly"): string {
  if (gran === "monthly") {
    const [y, m] = label.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-IN", {
      month: "short",
      year: "2-digit",
    });
  }
  const w = label.split("-W")[1];
  return w ? `W${w}` : label;
}

export async function getAnalysisOptions(): Promise<{
  campaigns: { id: string; name: string; status: string }[];
  jobTitles: { id: string; name: string }[];
}> {
  const supabase = await createClient();
  const [{ data: campaigns }, { data: jobTitles }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, status")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("job_titles").select("id, name").order("name"),
  ]);
  return {
    campaigns: (campaigns as any[]) ?? [],
    jobTitles: (jobTitles as any[]) ?? [],
  };
}

export async function getAnalysisThresholds(): Promise<AnalysisThresholds> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["health_on_track", "health_needs_attention"]);
  const map = new Map(
    ((data as any[]) ?? []).map((r: any) => [r.key, Number(r.value)]),
  );
  return {
    onTrack: map.get("health_on_track") ?? 80,
    needs: map.get("health_needs_attention") ?? 50,
  };
}

export async function getOverviewData(params: {
  campaignIds: string[];
  dateFrom: string;
  dateTo: string;
}): Promise<{ totals: OverviewTotals; byCampaign: CampaignOverviewRow[] }> {
  const supabase = await createClient();

  let tq = supabase
    .from("tasks")
    .select(
      "status, campaign_id, campaigns ( id, name, payout_enabled, payout_amount )",
    )
    .gte("due_date", params.dateFrom)
    .lte("due_date", params.dateTo);

  if (params.campaignIds.length > 0)
    tq = tq.in("campaign_id", params.campaignIds) as typeof tq;

  const { data: tasks } = await tq;
  const T = (tasks as any[]) ?? [];

  type CRow = {
    name: string;
    payout_enabled: boolean;
    payout_amount: number;
    assigned: number;
    submitted: number;
    approved: number;
    missed: number;
  };
  const campaignMap = new Map<string, CRow>();

  for (const t of T) {
    const cid = t.campaign_id as string;
    if (!campaignMap.has(cid)) {
      const c = t.campaigns as any;
      campaignMap.set(cid, {
        name: c?.name ?? "—",
        payout_enabled: c?.payout_enabled ?? false,
        payout_amount: Number(c?.payout_amount ?? 0),
        assigned: 0,
        submitted: 0,
        approved: 0,
        missed: 0,
      });
    }
    const row = campaignMap.get(cid)!;
    row.assigned++;
    if (["submitted", "approved", "rejected"].includes(t.status)) row.submitted++;
    if (t.status === "approved") row.approved++;
    if (t.status === "missed") row.missed++;
  }

  let totA = 0, totS = 0, totAp = 0, totM = 0, totPay = 0;
  const byCampaign: CampaignOverviewRow[] = [];

  for (const [id, row] of campaignMap.entries()) {
    totA += row.assigned;
    totS += row.submitted;
    totAp += row.approved;
    totM += row.missed;
    const campPay = row.payout_enabled ? row.approved * row.payout_amount : 0;
    totPay += campPay;
    byCampaign.push({
      id,
      name: row.name,
      assigned: row.assigned,
      submissionPct: pct(row.submitted, row.assigned),
      approvedPct: pct(row.approved, row.submitted),
      missedPct: pct(row.missed, row.assigned),
      payout: campPay,
    });
  }

  byCampaign.sort((a, b) => b.assigned - a.assigned);

  return {
    totals: {
      assigned: totA,
      submitted: totS,
      approved: totAp,
      missed: totM,
      submissionPct: pct(totS, totA),
      approvalPct: pct(totAp, totS),
      missedPct: pct(totM, totA),
      payoutCommitted: totPay,
    },
    byCampaign,
  };
}

export async function getTrendSeries(params: {
  campaignIds: string[];
  dateFrom: string;
  dateTo: string;
  granularity: "weekly" | "monthly";
}): Promise<TrendSeries[]> {
  const supabase = await createClient();

  let tq = supabase
    .from("tasks")
    .select("status, campaign_id, due_date, campaigns ( id, name )")
    .gte("due_date", params.dateFrom)
    .lte("due_date", params.dateTo)
    .order("due_date", { ascending: true });

  if (params.campaignIds.length > 0)
    tq = tq.in("campaign_id", params.campaignIds) as typeof tq;

  const { data: tasks } = await tq;
  const T = (tasks as any[]) ?? [];

  type Bucket = { assigned: number; submitted: number; approved: number };
  const bucketMap = new Map<string, Map<string, Bucket>>();
  const campaignNames = new Map<string, string>();

  for (const t of T) {
    const cid = t.campaign_id as string;
    campaignNames.set(cid, t.campaigns?.name ?? "—");
    const lbl =
      params.granularity === "weekly"
        ? isoWeekLabel(t.due_date)
        : monthLabel(t.due_date);
    if (!bucketMap.has(cid)) bucketMap.set(cid, new Map());
    const byB = bucketMap.get(cid)!;
    if (!byB.has(lbl)) byB.set(lbl, { assigned: 0, submitted: 0, approved: 0 });
    const b = byB.get(lbl)!;
    b.assigned++;
    if (["submitted", "approved", "rejected"].includes(t.status)) b.submitted++;
    if (t.status === "approved") b.approved++;
  }

  const allLabels = new Set<string>();
  for (const [, byB] of bucketMap) for (const lbl of byB.keys()) allLabels.add(lbl);
  const sortedLabels = [...allLabels].sort();

  return [...bucketMap.entries()].map(([campaignId, byB]) => ({
    campaignId,
    campaignName: campaignNames.get(campaignId) ?? "—",
    points: sortedLabels.map((lbl) => {
      const b = byB.get(lbl) ?? { assigned: 0, submitted: 0, approved: 0 };
      return {
        label: fmtBucketLabel(lbl, params.granularity),
        submissionPct: pct(b.submitted, b.assigned),
        approvalPct: pct(b.approved, b.submitted),
        assigned: b.assigned,
      };
    }),
  }));
}

export async function getStoreBreakdown(params: {
  campaignIds: string[];
  dateFrom: string;
  dateTo: string;
}): Promise<StoreAnalysisRow[]> {
  const supabase = await createClient();

  let tq = supabase
    .from("tasks")
    .select("status, store_id, stores ( id, name )")
    .gte("due_date", params.dateFrom)
    .lte("due_date", params.dateTo);

  if (params.campaignIds.length > 0)
    tq = tq.in("campaign_id", params.campaignIds) as typeof tq;

  const { data: tasks } = await tq;
  const T = (tasks as any[]) ?? [];

  const storeMap = new Map<
    string,
    { name: string; assigned: number; submitted: number; approved: number; missed: number }
  >();

  for (const t of T) {
    const sid = t.store_id as string;
    if (!storeMap.has(sid))
      storeMap.set(sid, {
        name: t.stores?.name ?? "—",
        assigned: 0,
        submitted: 0,
        approved: 0,
        missed: 0,
      });
    const row = storeMap.get(sid)!;
    row.assigned++;
    if (["submitted", "approved", "rejected"].includes(t.status)) row.submitted++;
    if (t.status === "approved") row.approved++;
    if (t.status === "missed") row.missed++;
  }

  const rows: StoreAnalysisRow[] = [...storeMap.entries()].map(([id, row]) => ({
    id,
    name: row.name,
    assigned: row.assigned,
    submitted: row.submitted,
    submissionPct: pct(row.submitted, row.assigned),
    approvedPct: pct(row.approved, row.submitted),
    missed: row.missed,
  }));

  rows.sort((a, b) => a.submissionPct - b.submissionPct);
  return rows;
}

export async function getPersonBreakdown(params: {
  campaignIds: string[];
  dateFrom: string;
  dateTo: string;
  jobTitleId: string;
}): Promise<PersonAnalysisRow[]> {
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("job_title_id", params.jobTitleId)
    .eq("status", "active");

  const profileList = (profiles as any[]) ?? [];
  if (!profileList.length) return [];

  const userIds = profileList.map((p: any) => p.id as string);

  const { data: userStores } = await supabase
    .from("user_stores")
    .select("user_id, store_id")
    .in("user_id", userIds);

  const storeToUsers = new Map<string, string[]>();
  for (const us of (userStores as any[]) ?? []) {
    if (!storeToUsers.has(us.store_id)) storeToUsers.set(us.store_id, []);
    storeToUsers.get(us.store_id)!.push(us.user_id);
  }

  const allStoreIds = [...storeToUsers.keys()];
  const userStats = new Map<
    string,
    { assigned: number; done: number; approved: number; missed: number }
  >(userIds.map((uid) => [uid, { assigned: 0, done: 0, approved: 0, missed: 0 }]));

  if (allStoreIds.length > 0) {
    let tq = supabase
      .from("tasks")
      .select("status, store_id")
      .in("store_id", allStoreIds)
      .gte("due_date", params.dateFrom)
      .lte("due_date", params.dateTo);

    if (params.campaignIds.length > 0)
      tq = tq.in("campaign_id", params.campaignIds) as typeof tq;

    const { data: tasks } = await tq;
    for (const t of (tasks as any[]) ?? []) {
      for (const uid of storeToUsers.get(t.store_id) ?? []) {
        const s = userStats.get(uid);
        if (!s) continue;
        s.assigned++;
        if (["submitted", "approved", "rejected"].includes(t.status)) s.done++;
        if (t.status === "approved") s.approved++;
        if (t.status === "missed") s.missed++;
      }
    }
  }

  const rows: PersonAnalysisRow[] = profileList.map((p: any) => {
    const s = userStats.get(p.id) ?? { assigned: 0, done: 0, approved: 0, missed: 0 };
    return {
      userId: p.id,
      name: p.display_name ?? "—",
      assigned: s.assigned,
      done: s.done,
      completionPct: pct(s.done, s.assigned),
      approved: s.approved,
      approvedPct: pct(s.approved, s.done),
      missed: s.missed,
    };
  });

  rows.sort((a, b) => a.completionPct - b.completionPct);
  return rows;
}

export async function getAiData(params: {
  campaignIds: string[];
  dateFrom: string;
  dateTo: string;
}): Promise<AiAnalysisData> {
  const supabase = await createClient();

  let tq = supabase
    .from("tasks")
    .select(
      "campaign_id, campaigns ( id, name ), submissions ( ai_verdict, human_verdict, ai_score, rejection_reason )",
    )
    .gte("due_date", params.dateFrom)
    .lte("due_date", params.dateTo);

  if (params.campaignIds.length > 0)
    tq = tq.in("campaign_id", params.campaignIds) as typeof tq;

  const { data: tasks } = await tq;
  const T = (tasks as any[]) ?? [];

  type Sub = {
    ai_verdict: string | null;
    human_verdict: string | null;
    ai_score: number | null;
    rejection_reason: string | null;
    campaignId: string;
    campaignName: string;
  };
  const subs: Sub[] = [];

  for (const t of T) {
    for (const s of t.submissions ?? []) {
      subs.push({
        ai_verdict: s.ai_verdict,
        human_verdict: s.human_verdict,
        ai_score: s.ai_score,
        rejection_reason: s.rejection_reason,
        campaignId: t.campaign_id,
        campaignName: t.campaigns?.name ?? "—",
      });
    }
  }

  const judged = subs.filter((s) => s.ai_verdict && s.human_verdict);
  const agree = judged.filter((s) => s.ai_verdict === s.human_verdict).length;
  const disagree = judged.length - agree;
  const aiApprovedHumanRejected = judged.filter(
    (s) => s.ai_verdict === "approved" && s.human_verdict === "rejected",
  ).length;
  const aiRejectedHumanApproved = judged.filter(
    (s) => s.ai_verdict === "rejected" && s.human_verdict === "approved",
  ).length;
  const missingAi = subs.filter((s) => s.ai_score == null).length;

  const reasonCounts = new Map<string, number>();
  for (const s of subs)
    if (s.human_verdict === "rejected" && s.rejection_reason)
      reasonCounts.set(
        s.rejection_reason,
        (reasonCounts.get(s.rejection_reason) ?? 0) + 1,
      );
  const rejectionReasons = [...reasonCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const campAi = new Map<
    string,
    { name: string; reviewed: number; aiPassed: number; overridden: number; missing: number }
  >();
  for (const s of subs) {
    if (!campAi.has(s.campaignId))
      campAi.set(s.campaignId, {
        name: s.campaignName,
        reviewed: 0,
        aiPassed: 0,
        overridden: 0,
        missing: 0,
      });
    const row = campAi.get(s.campaignId)!;
    row.reviewed++;
    if (s.ai_verdict === "approved") row.aiPassed++;
    if (s.ai_verdict && s.human_verdict && s.ai_verdict !== s.human_verdict) row.overridden++;
    if (s.ai_score == null) row.missing++;
  }

  const byCampaign = [...campAi.entries()]
    .map(([id, row]) => ({
      id,
      name: row.name,
      reviewed: row.reviewed,
      aiPassRate: pct(row.aiPassed, row.reviewed),
      overrideRate: pct(row.overridden, row.reviewed),
      missing: row.missing,
    }))
    .sort((a, b) => b.reviewed - a.reviewed);

  return {
    totalSubmissions: subs.length,
    reviewed: judged.length,
    agreed: agree,
    aiApprovedHumanRejected,
    aiRejectedHumanApproved,
    overrideRate: pct(disagree, judged.length),
    missingAi,
    rejectionReasons,
    byCampaign,
  };
}
