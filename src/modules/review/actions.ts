"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";
import { createAdminClient } from "@/core/db/admin";
import { getCurrentProfile } from "@/core/auth/session";
import { getAllowedCampaignIdsForUser } from "@/core/auth/campaign-scope";

type Result = { error?: string };

// Review actions use the admin client because RLS on submissions restricts updates
// to the submitter or admin — reviewers need to bypass RLS for verdict writes.
// Page-level access is already enforced by requireAccess("review"), but that only
// gates the page, not which campaigns a given reviewer may act on — checked here.
async function assertCanReview(
  admin: ReturnType<typeof createAdminClient>,
  submissionId: string,
): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me) return "Not signed in.";
  if (me.is_admin) return null;

  const { data: sub } = await admin
    .from("submissions")
    .select("campaign_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) return "Submission not found.";

  const supabase = await createClient();
  const allowed = await getAllowedCampaignIdsForUser(supabase, me.id);
  if (!allowed.includes(sub.campaign_id)) {
    return "You don't have access to review this submission.";
  }
  return null;
}

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
  const authError = await assertCanReview(supabase, id);
  if (authError) return { error: authError };
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
  const authError = await assertCanReview(supabase, id);
  if (authError) return { error: authError };
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
  const authError = await assertCanReview(supabase, id);
  if (authError) return { error: authError };
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
