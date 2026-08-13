import { createClient } from "@/core/db/server";
import type {
  ContestListRow,
  MonthListRow,
  MonthFormValues,
  SkuRequirement,
  SkuRow,
} from "./types";
import { EMPTY_REQUIREMENT } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MONTH_SELECT =
  "id, name, execution_type_id, frequency, status, start_date, end_date, instructions, " +
  "reference_images, payout_enabled, payout_amount, payout_model, payout_tiers, ai_review, " +
  "ai_strictness, pass_threshold, score_mode, ai_score_visible, scoring_rubric, capture_mode, " +
  "num_photos, brand_visibility_contest_id, created_at, " +
  "campaign_departments ( department_id ), campaign_stores ( store_id ), campaign_job_titles ( job_title_id )";

function mapRequirement(row: any): SkuRequirement {
  if (!row) return EMPTY_REQUIREMENT;
  return {
    mode: row.mode,
    category: row.category,
    minProducts: row.min_products,
    shelf: row.shelf,
    qtyMode: row.qty_mode,
    qty: row.qty,
  };
}

function mapSkus(rows: any[]): SkuRow[] {
  return (rows ?? []).map((r) => ({
    id: r.id,
    skuCode: r.sku_code,
    skuName: r.sku_name,
    shelf: r.shelf,
    qty: r.qty,
  }));
}

function mapMonthRow(row: any, requirement: SkuRequirement, skus: SkuRow[]): MonthFormValues {
  return {
    name: row.name,
    executionTypeId: row.execution_type_id,
    frequency: row.frequency,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    instructions: row.instructions ?? "",
    referenceImages: row.reference_images ?? [],
    departmentIds: (row.campaign_departments ?? []).map((d: any) => d.department_id),
    storeIds: (row.campaign_stores ?? []).map((s: any) => s.store_id),
    jobTitleIds: (row.campaign_job_titles ?? []).map((j: any) => j.job_title_id),
    payoutEnabled: row.payout_enabled,
    payoutAmount: Number(row.payout_amount ?? 0),
    payoutModel: row.payout_model,
    payoutTiers: row.payout_tiers ?? [],
    aiReview: row.ai_review,
    aiStrictness: row.ai_strictness,
    passThreshold: Number(row.pass_threshold ?? 7),
    scoreMode: row.score_mode,
    aiScoreVisible: row.ai_score_visible,
    scoringRubric: row.scoring_rubric ?? "",
    captureMode: row.capture_mode,
    numPhotos: row.num_photos,
    requirement,
    skus,
  };
}

export async function listContests(): Promise<ContestListRow[]> {
  const supabase = await createClient();
  const [{ data: contests }, { data: months }] = await Promise.all([
    supabase
      .from("brand_visibility_contests")
      .select("id, name, departments ( name )")
      .order("name"),
    supabase
      .from("campaigns")
      .select("brand_visibility_contest_id, name, status, start_date, created_at")
      .not("brand_visibility_contest_id", "is", null)
      .is("deleted_at", null)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  const byContest = new Map<string, any[]>();
  for (const m of (months as any[]) ?? []) {
    const arr = byContest.get(m.brand_visibility_contest_id) ?? [];
    arr.push(m);
    byContest.set(m.brand_visibility_contest_id, arr);
  }

  return ((contests as any[]) ?? []).map((c) => {
    const ms = byContest.get(c.id) ?? [];
    return {
      id: c.id,
      name: c.name,
      departmentName: c.departments?.name ?? null,
      monthCount: ms.length,
      latestMonthName: ms[0]?.name ?? null,
      latestMonthStatus: ms[0]?.status ?? null,
    };
  });
}

/** Existing campaigns not yet labelled into any contest — the pool an admin
 * picks from to pull historical brand-visibility campaigns in, without
 * copying anything. */
export async function listUnlabelledCampaigns(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("id, name")
    .is("brand_visibility_contest_id", null)
    .is("deleted_at", null)
    .order("name");
  return (data as { id: string; name: string }[]) ?? [];
}

export async function getContest(id: string): Promise<{ id: string; name: string; departmentName: string | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("brand_visibility_contests")
    .select("id, name, departments ( name )")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const d = data as any;
  return { id: d.id, name: d.name, departmentName: d.departments?.name ?? null };
}

export async function listMonths(contestId: string): Promise<MonthListRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("id, name, status, start_date, end_date, campaign_stores ( store_id )")
    .eq("brand_visibility_contest_id", contestId)
    .is("deleted_at", null)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  return ((data as any[]) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    storeCount: (r.campaign_stores ?? []).length,
  }));
}

async function getRequirementAndSkus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaignId: string,
): Promise<{ requirement: SkuRequirement; skus: SkuRow[] }> {
  const [{ data: req }, { data: skus }] = await Promise.all([
    supabase.from("campaign_sku_requirements").select("*").eq("campaign_id", campaignId).maybeSingle(),
    supabase.from("campaign_skus").select("*").eq("campaign_id", campaignId).order("sku_name"),
  ]);
  return { requirement: mapRequirement(req), skus: mapSkus(skus as any[]) };
}

/** Just the requirement — for views (like Summary's grid) that need to show
 * what's required without pulling the whole setup form. */
export async function getRequirementForCampaign(
  campaignId: string,
): Promise<{ requirement: SkuRequirement; skus: SkuRow[] }> {
  const supabase = await createClient();
  return getRequirementAndSkus(supabase, campaignId);
}

export async function getMonthForEdit(campaignId: string): Promise<MonthFormValues | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select(MONTH_SELECT).eq("id", campaignId).maybeSingle();
  if (!data) return null;
  const { requirement, skus } = await getRequirementAndSkus(supabase, campaignId);
  return mapMonthRow(data, requirement, skus);
}

/** Pre-fill for "start next month" — the contest's most recent month, with
 * an empty name/status/dates since those are always chosen fresh. */
export async function getLatestMonth(contestId: string): Promise<MonthFormValues | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select(MONTH_SELECT)
    .eq("brand_visibility_contest_id", contestId)
    .is("deleted_at", null)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const d = data as any;
  const { requirement, skus } = await getRequirementAndSkus(supabase, d.id);
  const mapped = mapMonthRow(d, requirement, skus);
  return { ...mapped, name: "", status: "draft", startDate: null, endDate: null };
}
