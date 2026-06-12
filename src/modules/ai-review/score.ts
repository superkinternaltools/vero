import { createAdminClient } from "@/core/db/admin";
import { runAiScoring } from "./engine";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Scores a real submission against its campaign's reference images + rubric.
 * Runs with the service-role client (system operation). Best-effort: on any
 * failure the AI fields stay null so the submission falls to manual review.
 */
export async function scoreSubmission(submissionId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, task_id, photos, campaign_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) return;

  const { data: c } = await supabase
    .from("campaigns")
    .select(
      "ai_review, ai_strictness, pass_threshold, score_mode, scoring_rubric, instructions, reference_images",
    )
    .eq("id", (sub as any).campaign_id)
    .maybeSingle();
  if (!c || !(c as any).ai_review) return;

  const campaign = c as any;

  try {
    const result = await runAiScoring({
      referenceImages: campaign.reference_images ?? [],
      photos: (sub as any).photos ?? [],
      instructions: campaign.instructions,
      rubric: campaign.scoring_rubric,
      strictness: campaign.ai_strictness,
      passThreshold: Number(campaign.pass_threshold),
    });
    if (!result) return;

    const update: Record<string, unknown> = {
      ai_score: result.score,
      ai_verdict: result.verdict,
      ai_assessment: result.assessment,
    };
    if (campaign.score_mode === "ai_auto_approve" && result.verdict === "approved") {
      update.human_verdict = "approved";
      update.status = "approved";
    }

    await supabase.from("submissions").update(update).eq("id", submissionId);

    if (update.status === "approved" && (sub as any).task_id) {
      await supabase.from("tasks").update({ status: "approved" }).eq("id", (sub as any).task_id);
    }
  } catch {
    // leave AI fields null → manual review
  }
}
