"use server";

import { createClient } from "@/core/db/server";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SubmissionDetail = {
  id: string;
  photos: string[];
  submittedByName: string | null;
  aiScore: number | null;
  aiVerdict: string | null;
  humanVerdict: string | null;
  rejectionReason: string | null;
  payoutTierLabel: string | null;
  comments: string | null;
};

export type TaskDetail = {
  taskId: string;
  campaignName: string;
  storeName: string;
  dueDate: string;
  status: string;
  nonSubmissionReason: string | null;
  submission: SubmissionDetail | null;
};

export async function getUserTaskDetails(params: {
  userId: string;
  campaignIds: string[];
  dateFrom: string;
  dateTo: string;
}): Promise<TaskDetail[]> {
  const supabase = await createClient();

  const { data: userStores } = await supabase
    .from("user_stores")
    .select("store_id")
    .eq("user_id", params.userId);

  const storeIds = (userStores as any[] ?? []).map((us) => us.store_id as string);
  if (!storeIds.length) return [];

  let q = supabase
    .from("tasks")
    .select(`
      id, status, due_date, non_submission_reason,
      campaigns ( name ),
      stores ( name ),
      submissions ( id, photos, ai_score, ai_verdict, human_verdict, rejection_reason, payout_tier_label, comments, created_at, submitted_by, profiles ( display_name ) )
    `)
    .in("store_id", storeIds)
    .gte("due_date", params.dateFrom)
    .lte("due_date", params.dateTo)
    .order("due_date", { ascending: true });

  if (params.campaignIds.length > 0) q = q.in("campaign_id", params.campaignIds);

  const { data: tasks } = await q;

  return ((tasks as any[]) ?? []).map((t): TaskDetail => {
    // Pick the most recent submission if there are multiple
    const subs: any[] = (t.submissions ?? []);
    subs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const sub = subs[0] ?? null;
    return {
      taskId: t.id,
      campaignName: t.campaigns?.name ?? "—",
      storeName: t.stores?.name ?? "—",
      dueDate: t.due_date,
      status: t.status,
      nonSubmissionReason: t.non_submission_reason ?? null,
      submission: sub
        ? {
            id: sub.id,
            photos: sub.photos ?? [],
            submittedByName: sub.profiles?.display_name ?? null,
            aiScore: sub.ai_score ?? null,
            aiVerdict: sub.ai_verdict ?? null,
            humanVerdict: sub.human_verdict ?? null,
            rejectionReason: sub.rejection_reason ?? null,
            payoutTierLabel: sub.payout_tier_label ?? null,
            comments: sub.comments ?? null,
          }
        : null,
    };
  });
}
