import { createClient } from "@/core/db/server";
import type { CampaignListRow, CampaignFormValues } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function listCampaigns(): Promise<CampaignListRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select(
      `
      id, name, frequency, status, payout_enabled, payout_amount,
      execution_types ( name ),
      campaign_departments ( departments ( name ) ),
      campaign_stores ( store_id )
      `,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return ((data as any[]) ?? []).map((row): CampaignListRow => ({
    id: row.id,
    name: row.name,
    frequency: row.frequency,
    status: row.status,
    payout_enabled: row.payout_enabled,
    payout_amount: row.payout_amount,
    executionTypeName: row.execution_types?.name ?? null,
    departmentNames: (row.campaign_departments ?? [])
      .map((x: any) => x.departments?.name)
      .filter(Boolean),
    storeCount: (row.campaign_stores ?? []).length,
  }));
}

export async function getCampaign(
  id: string,
): Promise<(CampaignFormValues & { id: string }) | null> {
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!c) return null;

  const [{ data: depts }, { data: stores }, { data: jobs }] = await Promise.all([
    supabase.from("campaign_departments").select("department_id").eq("campaign_id", id),
    supabase.from("campaign_stores").select("store_id").eq("campaign_id", id),
    supabase.from("campaign_job_titles").select("job_title_id").eq("campaign_id", id),
  ]);

  const row = c as any;
  return {
    id: row.id,
    name: row.name,
    execution_type_id: row.execution_type_id,
    frequency: row.frequency,
    status: row.status,
    start_date: row.start_date,
    end_date: row.end_date,
    instructions: row.instructions ?? "",
    reference_images: row.reference_images ?? [],
    departmentIds: (depts ?? []).map((d: any) => d.department_id),
    storeIds: (stores ?? []).map((s: any) => s.store_id),
    jobTitleIds: (jobs ?? []).map((j: any) => j.job_title_id),
    payout_enabled: row.payout_enabled,
    payout_amount: Number(row.payout_amount),
    payout_model: row.payout_model,
    payout_tiers: row.payout_tiers ?? [],
    ai_review: row.ai_review,
    ai_strictness: row.ai_strictness,
    pass_threshold: Number(row.pass_threshold),
    score_mode: row.score_mode,
    ai_score_visible: row.ai_score_visible,
    scoring_rubric: row.scoring_rubric ?? "",
    capture_mode: row.capture_mode,
    num_photos: row.num_photos,
    allow_late: row.allow_late,
    skip_weekends: row.skip_weekends,
    skip_holidays: row.skip_holidays,
    skip_dates: row.skip_dates ?? [],
    submission_window_start: row.submission_window_start ?? null,
    submission_window_end: row.submission_window_end ?? null,
  };
}
