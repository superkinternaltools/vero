"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";
import { autoGenerateTasks, purgePendingTasks, pruneTasksForStores } from "@/modules/tasks/actions";
import type { MonthFormValues } from "./types";

type Result = { error?: string; id?: string };

function scalars(v: MonthFormValues) {
  return {
    name: v.name.trim(),
    execution_type_id: v.executionTypeId,
    frequency: v.frequency,
    status: v.status,
    start_date: v.startDate || null,
    end_date: v.endDate || null,
    instructions: v.instructions || null,
    reference_images: v.referenceImages,
    payout_enabled: v.payoutEnabled,
    payout_amount: Number.isFinite(v.payoutAmount) ? v.payoutAmount : 0,
    payout_model: v.payoutModel,
    payout_tiers: v.payoutModel === "tiered" ? v.payoutTiers : [],
    ai_review: v.aiReview,
    ai_strictness: v.aiStrictness,
    pass_threshold: Number.isFinite(v.passThreshold) ? v.passThreshold : 7,
    score_mode: v.scoreMode,
    ai_score_visible: v.aiScoreVisible,
    scoring_rubric: v.scoringRubric || null,
    capture_mode: v.captureMode,
    num_photos: v.numPhotos > 0 ? v.numPhotos : 1,
  };
}

async function replaceJoins(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaignId: string,
  v: MonthFormValues,
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

async function replaceRequirement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaignId: string,
  v: MonthFormValues,
) {
  const r = v.requirement;
  await supabase.from("campaign_sku_requirements").delete().eq("campaign_id", campaignId);
  await supabase.from("campaign_sku_requirements").insert({
    campaign_id: campaignId,
    mode: r.mode,
    category: r.mode === "any_category" ? r.category : null,
    min_products: r.mode === "all" ? null : r.minProducts,
    shelf: r.mode === "all" ? null : r.shelf,
    qty_mode: r.mode === "all" ? null : r.qtyMode,
    qty: r.mode === "all" ? null : r.qty,
  });

  await supabase.from("campaign_skus").delete().eq("campaign_id", campaignId);
  if (r.mode !== "any_category" && v.skus.length) {
    await supabase.from("campaign_skus").insert(
      v.skus.map((s) => ({
        campaign_id: campaignId,
        sku_code: s.skuCode,
        sku_name: s.skuName,
        shelf: r.mode === "all" ? s.shelf : null,
        qty: r.mode === "all" ? s.qty : null,
      })),
    );
  }
}

export async function createContest(name: string, departmentId: string | null): Promise<Result> {
  if (!name.trim()) return { error: "Name is required." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_visibility_contests")
    .insert({ name: name.trim(), department_id: departmentId })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/brand-visibility");
  return { id: data.id };
}

export async function createMonth(contestId: string, v: MonthFormValues): Promise<Result> {
  if (!v.name.trim()) return { error: "Month name is required." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ ...scalars(v), brand_visibility_contest_id: contestId })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await replaceJoins(supabase, data.id, v);
  await replaceRequirement(supabase, data.id, v);
  revalidatePath(`/brand-visibility/${contestId}`);
  if (v.status === "active") await autoGenerateTasks(data.id);
  return { id: data.id };
}

export async function updateMonth(campaignId: string, contestId: string, v: MonthFormValues): Promise<Result> {
  if (!v.name.trim()) return { error: "Month name is required." };
  const supabase = await createClient();

  const { data: existingStores } = await supabase
    .from("campaign_stores")
    .select("store_id")
    .eq("campaign_id", campaignId);
  const removedStoreIds = (existingStores ?? [])
    .map((r) => r.store_id)
    .filter((storeId) => !v.storeIds.includes(storeId));

  const { error } = await supabase.from("campaigns").update(scalars(v)).eq("id", campaignId);
  if (error) return { error: error.message };
  await replaceJoins(supabase, campaignId, v);
  await replaceRequirement(supabase, campaignId, v);
  if (removedStoreIds.length) await pruneTasksForStores(campaignId, removedStoreIds);

  revalidatePath(`/brand-visibility/${contestId}`);
  revalidatePath(`/brand-visibility/${contestId}/${campaignId}`);
  if (v.status === "active") {
    await autoGenerateTasks(campaignId);
  } else {
    await purgePendingTasks(campaignId);
  }
  return { id: campaignId };
}

/** Pulls existing campaigns into a contest WITHOUT copying anything — their
 * tasks, submissions and payout history stay exactly where they are. Purely
 * a label, so campaigns keep appearing in the regular Campaigns list too. */
export async function labelExistingCampaigns(campaignIds: string[], contestId: string): Promise<Result> {
  if (!campaignIds.length) return {};
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update({ brand_visibility_contest_id: contestId })
    .in("id", campaignIds);
  if (error) return { error: error.message };
  revalidatePath("/campaigns");
  revalidatePath(`/brand-visibility/${contestId}`);
  return {};
}
