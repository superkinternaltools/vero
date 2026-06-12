import { createClient } from "@/core/db/server";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Analytics = {
  funnel: { assigned: number; submitted: number; aiPassed: number; humanApproved: number };
  rates: {
    submission: number;
    approval: number;
    nonRejection: number;
    rejection: number;
    missed: number;
    reupload: number;
  };
  ai: { agree: number; disagree: number; overrideRate: number; missing: number; total: number };
  rejectionReasons: { name: string; count: number }[];
  payoutCommitted: number;
};

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);

export async function getAnalytics(): Promise<Analytics> {
  const supabase = await createClient();

  const [{ data: tasks }, { data: subs }, { data: campaigns }] = await Promise.all([
    supabase.from("tasks").select("status"),
    supabase
      .from("submissions")
      .select("ai_verdict, human_verdict, ai_score, rejection_reason, status, campaign_id"),
    supabase.from("campaigns").select("id, payout_enabled, payout_amount"),
  ]);

  const T = (tasks as any[]) ?? [];
  const S = (subs as any[]) ?? [];
  const payoutMap = new Map<string, number>();
  for (const c of (campaigns as any[]) ?? [])
    payoutMap.set(c.id, c.payout_enabled ? Number(c.payout_amount) : 0);

  const assigned = T.length;
  const submitted = T.filter((t) => ["submitted", "approved", "rejected"].includes(t.status)).length;
  const missed = T.filter((t) => t.status === "missed").length;
  const humanApproved = T.filter((t) => t.status === "approved").length;
  const aiPassed = S.filter((s) => s.ai_verdict === "approved").length;

  const reviewed = S.filter((s) => s.human_verdict).length;
  const rejected = S.filter((s) => s.human_verdict === "rejected").length;

  // AI vs human agreement (only where both exist)
  const judged = S.filter((s) => s.ai_verdict && s.human_verdict);
  const agree = judged.filter((s) => s.ai_verdict === s.human_verdict).length;
  const disagree = judged.length - agree;
  const missing = S.filter((s) => s.ai_score == null).length;

  // rejection reasons
  const reasonCounts = new Map<string, number>();
  for (const s of S)
    if (s.human_verdict === "rejected" && s.rejection_reason)
      reasonCounts.set(s.rejection_reason, (reasonCounts.get(s.rejection_reason) ?? 0) + 1);
  const rejectionReasons = [...reasonCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const payoutCommitted = S.filter((s) => s.status === "approved").reduce(
    (sum, s) => sum + (payoutMap.get(s.campaign_id) ?? 0),
    0,
  );

  return {
    funnel: { assigned, submitted, aiPassed, humanApproved },
    rates: {
      submission: pct(submitted, assigned),
      approval: pct(humanApproved, submitted),
      nonRejection: pct(reviewed - rejected, reviewed),
      rejection: pct(rejected, reviewed),
      missed: pct(missed, assigned),
      reupload: pct(Math.max(0, S.length - submitted), submitted),
    },
    ai: {
      agree,
      disagree,
      overrideRate: pct(disagree, agree + disagree),
      missing,
      total: S.length,
    },
    rejectionReasons,
    payoutCommitted,
  };
}
