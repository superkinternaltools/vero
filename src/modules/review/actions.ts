"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/core/db/admin";

type Result = { error?: string };

// Review actions use the admin client because RLS on submissions restricts updates
// to the submitter or admin — reviewers need to bypass RLS for verdict writes.
// Page-level access is already enforced by requireAccess("review").
async function setTaskStatusFor(
  supabase: ReturnType<typeof createAdminClient>,
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
  const supabase = createAdminClient();
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
  rejectionReason?: string,
): Promise<Result> {
  const supabase = createAdminClient();
  const isApproved = tierPct > 0;
  const verdict = isApproved ? "approved" : "rejected";
  const { error } = await supabase
    .from("submissions")
    .update({
      human_verdict: verdict,
      status: verdict,
      payout_tier_label: tierLabel,
      rejection_reason: (!isApproved && rejectionReason?.trim()) ? rejectionReason.trim() : null,
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
  const supabase = createAdminClient();
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
