"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";

type Result = { error?: string };

async function setTaskStatusFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  submissionId: string,
  status: "approved" | "rejected",
) {
  const { data: sub } = await supabase
    .from("submissions")
    .select("task_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (sub?.task_id) await supabase.from("tasks").update({ status }).eq("id", sub.task_id);
}

export async function approveSubmission(id: string, reviewerScore?: number): Promise<Result> {
  const supabase = await createClient();
  const update: Record<string, unknown> = {
    human_verdict: "approved",
    status: "approved",
    rejection_reason: null,
  };
  if (reviewerScore != null && reviewerScore >= 0 && reviewerScore <= 10) {
    update.reviewer_score = reviewerScore;
  }
  const { error } = await supabase.from("submissions").update(update).eq("id", id);
  if (error) return { error: error.message };
  await setTaskStatusFor(supabase, id, "approved");
  revalidatePath("/review");
  revalidatePath("/tasks");
  return {};
}

export async function selectPayoutTier(
  id: string,
  tierLabel: string,
  tierPct: number,
): Promise<Result> {
  const supabase = await createClient();
  const isApproved = tierPct > 0;
  const verdict = isApproved ? "approved" : "rejected";
  const { error } = await supabase
    .from("submissions")
    .update({
      human_verdict: verdict,
      status: verdict,
      payout_tier_label: tierLabel,
      rejection_reason: null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  await setTaskStatusFor(supabase, id, verdict);
  revalidatePath("/review");
  revalidatePath("/tasks");
  revalidatePath("/summary");
  return {};
}

export async function rejectSubmission(id: string, reason: string): Promise<Result> {
  if (!reason.trim()) return { error: "A rejection reason is required." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("submissions")
    .update({ human_verdict: "rejected", status: "rejected", rejection_reason: reason })
    .eq("id", id);
  if (error) return { error: error.message };
  await setTaskStatusFor(supabase, id, "rejected");
  revalidatePath("/review");
  revalidatePath("/tasks");
  return {};
}
