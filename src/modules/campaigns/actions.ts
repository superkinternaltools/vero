"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";
import type { CampaignFormValues } from "./types";

type Result = { error?: string; id?: string };

function scalars(v: CampaignFormValues) {
  return {
    name: v.name.trim(),
    execution_type_id: v.execution_type_id,
    frequency: v.frequency,
    status: v.status,
    start_date: v.start_date || null,
    end_date: v.end_date || null,
    instructions: v.instructions || null,
    reference_images: v.reference_images,
    payout_enabled: v.payout_enabled,
    payout_amount: Number.isFinite(v.payout_amount) ? v.payout_amount : 0,
    payout_model: v.payout_model,
    ai_review: v.ai_review,
    ai_strictness: v.ai_strictness,
    pass_threshold: Number.isFinite(v.pass_threshold) ? v.pass_threshold : 7,
    score_mode: v.score_mode,
    ai_score_visible: v.ai_score_visible,
    scoring_rubric: v.scoring_rubric || null,
    capture_mode: v.capture_mode,
    num_photos: v.num_photos > 0 ? v.num_photos : 1,
    allow_late: v.allow_late,
    skip_weekends: v.skip_weekends,
    skip_holidays: v.skip_holidays,
  };
}

async function replaceJoins(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaignId: string,
  v: CampaignFormValues,
) {
  await supabase.from("campaign_departments").delete().eq("campaign_id", campaignId);
  if (v.departmentIds.length)
    await supabase
      .from("campaign_departments")
      .insert(v.departmentIds.map((department_id) => ({ campaign_id: campaignId, department_id })));

  await supabase.from("campaign_stores").delete().eq("campaign_id", campaignId);
  if (v.storeIds.length)
    await supabase
      .from("campaign_stores")
      .insert(v.storeIds.map((store_id) => ({ campaign_id: campaignId, store_id })));

  await supabase.from("campaign_job_titles").delete().eq("campaign_id", campaignId);
  if (v.jobTitleIds.length)
    await supabase
      .from("campaign_job_titles")
      .insert(v.jobTitleIds.map((job_title_id) => ({ campaign_id: campaignId, job_title_id })));
}

export async function createCampaign(v: CampaignFormValues): Promise<Result> {
  if (!v.name.trim()) return { error: "Campaign name is required." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert(scalars(v))
    .select("id")
    .single();
  if (error) return { error: error.message };
  await replaceJoins(supabase, data.id, v);
  revalidatePath("/campaigns");
  return { id: data.id };
}

export async function updateCampaign(id: string, v: CampaignFormValues): Promise<Result> {
  if (!v.name.trim()) return { error: "Campaign name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").update(scalars(v)).eq("id", id);
  if (error) return { error: error.message };
  await replaceJoins(supabase, id, v);
  revalidatePath("/campaigns");
  return { id };
}

export async function deleteCampaign(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase
    .from("campaigns")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/campaigns");
}
