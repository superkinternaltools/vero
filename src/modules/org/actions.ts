"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";

type Result = { error?: string };

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---- Roles ---- */
export async function createRole(name: string): Promise<Result> {
  if (!name.trim()) return { error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("roles")
    .insert({ name: name.trim(), slug: slugify(name) });
  if (error) return { error: error.message };
  revalidatePath("/org");
  return {};
}
export async function renameRole(id: string, name: string): Promise<Result> {
  if (!name.trim()) return { error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("roles").update({ name: name.trim() }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/org");
  return {};
}
export async function deleteRole(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data } = await supabase.from("roles").select("slug").eq("id", id).maybeSingle();
  if (data?.slug === "admin") return { error: "The Admin role can't be deleted." };
  const { error } = await supabase.from("roles").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/org");
  return {};
}

/* ---- Departments ---- */
export async function createDepartment(name: string): Promise<Result> {
  if (!name.trim()) return { error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({ name: name.trim() });
  if (error) return { error: error.message };
  revalidatePath("/org");
  return {};
}
export async function renameDepartment(id: string, name: string): Promise<Result> {
  if (!name.trim()) return { error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("departments").update({ name: name.trim() }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/org");
  return {};
}
export async function deleteDepartment(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/org");
  return {};
}

/* ---- Job Titles ---- */
export async function createJobTitle(name: string): Promise<Result> {
  if (!name.trim()) return { error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("job_titles").insert({ name: name.trim() });
  if (error) return { error: error.message };
  revalidatePath("/org");
  return {};
}
export async function renameJobTitle(id: string, name: string): Promise<Result> {
  if (!name.trim()) return { error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("job_titles").update({ name: name.trim() }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/org");
  return {};
}
export async function deleteJobTitle(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("job_titles").delete().eq("id", id);
  if (error) {
    if ((error as { code?: string }).code === "23503")
      return { error: "This job title is assigned to users. Reassign them first." };
    return { error: error.message };
  }
  revalidatePath("/org");
  return {};
}

/* ---- Execution Types ---- */
export async function createExecutionType(name: string): Promise<Result> {
  if (!name.trim()) return { error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("execution_types").insert({ name: name.trim() });
  if (error) return { error: error.message };
  revalidatePath("/org");
  return {};
}
export async function renameExecutionType(id: string, name: string): Promise<Result> {
  if (!name.trim()) return { error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("execution_types").update({ name: name.trim() }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/org");
  return {};
}
export async function deleteExecutionType(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("execution_types").delete().eq("id", id);
  if (error) {
    if ((error as { code?: string }).code === "23503")
      return { error: "This execution type is used by campaigns. Reassign them first." };
    return { error: error.message };
  }
  revalidatePath("/org");
  return {};
}

/* ---- Generic reason-list helpers (rejection + non-submission) ---- */
async function createReason(table: string, name: string): Promise<Result> {
  if (!name.trim()) return { error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from(table).insert({ name: name.trim() });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return {};
}
async function renameReason(table: string, id: string, name: string): Promise<Result> {
  if (!name.trim()) return { error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ name: name.trim() }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return {};
}
async function deleteReason(table: string, id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return {};
}

export async function createRejectionReason(name: string) {
  return createReason("rejection_reasons", name);
}
export async function renameRejectionReason(id: string, name: string) {
  return renameReason("rejection_reasons", id, name);
}
export async function deleteRejectionReason(id: string) {
  return deleteReason("rejection_reasons", id);
}
export async function createNonSubmissionReason(name: string) {
  return createReason("non_submission_reasons", name);
}
export async function renameNonSubmissionReason(id: string, name: string) {
  return renameReason("non_submission_reasons", id, name);
}
export async function deleteNonSubmissionReason(id: string) {
  return deleteReason("non_submission_reasons", id);
}

/* ---- System-guarded lists (campaign statuses + payout models) ----
   Built-in rows (draft/active/paused/completed, binary/tiered) drive app
   behaviour, so they can't be renamed or deleted — only added to. */
async function guardSystem(table: string, id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("is_system, name").eq("id", id).maybeSingle();
  if (data?.is_system) return `"${data.name}" is a built-in value and can't be changed.`;
  return null;
}

export async function createCampaignStatus(name: string) {
  return createReason("campaign_statuses", name.trim().toLowerCase());
}
export async function renameCampaignStatus(id: string, name: string) {
  const blocked = await guardSystem("campaign_statuses", id);
  if (blocked) return { error: blocked };
  return renameReason("campaign_statuses", id, name.trim().toLowerCase());
}
export async function deleteCampaignStatus(id: string) {
  const blocked = await guardSystem("campaign_statuses", id);
  if (blocked) return { error: blocked };
  return deleteReason("campaign_statuses", id);
}

export async function createPayoutModel(name: string) {
  return createReason("payout_models", name.trim().toLowerCase());
}
export async function renamePayoutModel(id: string, name: string) {
  const blocked = await guardSystem("payout_models", id);
  if (blocked) return { error: blocked };
  return renameReason("payout_models", id, name.trim().toLowerCase());
}
export async function deletePayoutModel(id: string) {
  const blocked = await guardSystem("payout_models", id);
  if (blocked) return { error: blocked };
  return deleteReason("payout_models", id);
}
