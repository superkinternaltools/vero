import { createAdminClient } from "@/core/db/admin";
import { runAiScoring } from "./engine";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Scores a real submission against its campaign's reference images + rubric.
 * Retries up to 3 times on transient failures. If all attempts fail the AI
 * fields stay null so the submission falls to manual review.
 */
export async function scoreSubmission(submissionId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, task_id, photos, campaign_id, human_verdict")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) return;

  const { data: c } = await supabase
    .from("campaigns")
    .select(
      "ai_review, ai_strictness, pass_threshold, score_mode, scoring_rubric, instructions, reference_images, payout_model, payout_tiers",
    )
    .eq("id", (sub as any).campaign_id)
    .maybeSingle();
  if (!c || !(c as any).ai_review) return;

  const campaign = c as any;

  const { data: sysRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "ai_system_instruction")
    .maybeSingle();

  let result = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await runAiScoring({
        referenceImages: campaign.reference_images ?? [],
        photos: (sub as any).photos ?? [],
        instructions: campaign.instructions,
        rubric: campaign.scoring_rubric,
        strictness: campaign.ai_strictness,
        passThreshold: Number(campaign.pass_threshold),
        systemInstruction: (sysRow as any)?.value ?? undefined,
      });
      if (result) break;
    } catch {
      // retry
    }
  }
  if (!result) return;

  // For tiered campaigns map the AI score to the matching tier label.
  let aiVerdict: string = result.verdict;
  let matchedTier: { label: string; pct: number } | null = null;
  if (
    campaign.payout_model === "tiered" &&
    Array.isArray(campaign.payout_tiers) &&
    campaign.payout_tiers.length > 0
  ) {
    for (const t of campaign.payout_tiers as { label: string; min_score: number; max_score: number; pct: number }[]) {
      if (result.score >= t.min_score && result.score <= t.max_score) {
        matchedTier = t;
        aiVerdict = t.label;
        break;
      }
    }
  }

  const update: Record<string, unknown> = {
    ai_score: result.score,
    ai_verdict: aiVerdict,
    ai_assessment: result.assessment,
  };

  // A human verdict already on record is final — auto-approve exists to
  // stand in for an absent human decision, never to overwrite one (e.g.
  // when backfilling AI scores onto submissions a reviewer already decided).
  if (campaign.score_mode === "ai_auto_approve" && !(sub as any).human_verdict) {
    if (matchedTier) {
      update.payout_tier_label = matchedTier.label;
      update.human_verdict = matchedTier.pct > 0 ? "approved" : "rejected";
      update.status = matchedTier.pct > 0 ? "approved" : "rejected";
    } else if (campaign.payout_model !== "tiered" && result.verdict === "approved") {
      // Binary campaigns have no tier to match — approve directly.
      update.human_verdict = "approved";
      update.status = "approved";
    }
    // Tiered campaign whose score didn't land in any configured tier: leave
    // status untouched so it falls to manual review instead of auto-approving
    // with no tier on record (which would silently pay out ₹0).
  }

  await supabase.from("submissions").update(update).eq("id", submissionId);

  if (update.status === "approved" && (sub as any).task_id) {
    await supabase.from("tasks").update({ status: "approved" }).eq("id", (sub as any).task_id);
  }
}
