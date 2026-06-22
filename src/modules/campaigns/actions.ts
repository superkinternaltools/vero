"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";
import { autoGenerateTasks, purgePendingTasks } from "@/modules/tasks/actions";
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
    payout_tiers: v.payout_model === "tiered" ? v.payout_tiers : [],
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
    skip_dates: v.skip_dates,
    submission_window_start: v.submission_window_start || null,
    submission_window_end: v.submission_window_end || null,
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
  if (v.status === "active") await autoGenerateTasks(data.id);
  return { id: data.id };
}

export async function updateCampaign(id: string, v: CampaignFormValues): Promise<Result> {
  if (!v.name.trim()) return { error: "Campaign name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").update(scalars(v)).eq("id", id);
  if (error) return { error: error.message };
  await replaceJoins(supabase, id, v);
  revalidatePath("/campaigns");
  if (v.status === "active") {
    await autoGenerateTasks(id);
  } else {
    await purgePendingTasks(id);
  }
  return { id };
}

export async function duplicateCampaign(formData: FormData): Promise<void> {
  const { redirect } = await import("next/navigation");
  const id = String(formData.get("id"));
  const supabase = await createClient();

  const { data: src } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!src) return;

  const [{ data: depts }, { data: stores }, { data: jobs }] = await Promise.all([
    supabase.from("campaign_departments").select("department_id").eq("campaign_id", id),
    supabase.from("campaign_stores").select("store_id").eq("campaign_id", id),
    supabase.from("campaign_job_titles").select("job_title_id").eq("campaign_id", id),
  ]);

  const s = src as any;
  const { data: newCampaign, error } = await supabase
    .from("campaigns")
    .insert({
      name: `Copy of ${s.name}`,
      execution_type_id: s.execution_type_id,
      frequency: s.frequency,
      status: "draft",
      start_date: null,
      end_date: null,
      instructions: s.instructions,
      reference_images: s.reference_images ?? [],
      payout_enabled: s.payout_enabled,
      payout_amount: s.payout_amount,
      payout_model: s.payout_model,
      payout_tiers: s.payout_tiers ?? [],
      ai_review: s.ai_review,
      ai_strictness: s.ai_strictness,
      pass_threshold: s.pass_threshold,
      score_mode: s.score_mode,
      ai_score_visible: s.ai_score_visible,
      scoring_rubric: s.scoring_rubric,
      capture_mode: s.capture_mode,
      num_photos: s.num_photos,
      allow_late: s.allow_late,
      skip_weekends: s.skip_weekends,
      skip_holidays: s.skip_holidays,
      skip_dates: s.skip_dates ?? [],
    })
    .select("id")
    .single();

  if (error || !newCampaign) return;

  const newId = newCampaign.id;
  await Promise.all([
    depts?.length
      ? supabase.from("campaign_departments").insert(depts.map((d) => ({ campaign_id: newId, department_id: d.department_id })))
      : Promise.resolve(),
    stores?.length
      ? supabase.from("campaign_stores").insert(stores.map((s2) => ({ campaign_id: newId, store_id: s2.store_id })))
      : Promise.resolve(),
    jobs?.length
      ? supabase.from("campaign_job_titles").insert(jobs.map((j) => ({ campaign_id: newId, job_title_id: j.job_title_id })))
      : Promise.resolve(),
  ]);

  revalidatePath("/campaigns");
  redirect(`/campaigns/${newId}/edit`);
}

export async function deleteCampaign(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase
    .from("campaigns")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  await purgePendingTasks(id);
  revalidatePath("/campaigns");
}
