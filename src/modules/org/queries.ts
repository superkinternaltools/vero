import { createClient } from "@/core/db/server";

export type RoleOption = { id: string; slug: string; name: string };
export type Option = { id: string; name: string };

async function listNamed(table: string): Promise<Option[]> {
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("id, name").order("name");
  return (data as Option[]) ?? [];
}

export async function listRoles(): Promise<RoleOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("roles").select("id, slug, name").order("name");
  return (data as RoleOption[]) ?? [];
}

export const listDepartments = () => listNamed("departments");
export const listJobTitles = () => listNamed("job_titles");
export const listExecutionTypes = () => listNamed("execution_types");
export const listRejectionReasons = () => listNamed("rejection_reasons");
export const listNonSubmissionReasons = () => listNamed("non_submission_reasons");
export const listCampaignStatuses = () => listNamed("campaign_statuses");
export const listPayoutModels = () => listNamed("payout_models");

export type CategoryOption = Option & { is_brand_category: boolean };
export async function listCampaignCategories(): Promise<CategoryOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaign_categories")
    .select("id, name, is_brand_category")
    .order("name");
  return (data as CategoryOption[]) ?? [];
}

export const listBrands = () => listNamed("brands");
