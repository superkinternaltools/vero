"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";
import { requireAdmin } from "@/core/auth/session";
import { requireAccess } from "@/core/auth/access";
import {
  buildStoreResolver,
  normalizeName,
  getVeroCampaignSyncPreview,
  listCampaignOptions,
  getContestMonthReport,
  getOrGenerateContestReport,
} from "./queries";
import type { VeroCampaignSyncPreview, ContestReport } from "./queries";
import { clearDummyData } from "./seed";
import { runContestChatTurn } from "./chat";
import type { ChatTurn } from "./chat";
import type {
  CampaignSourceRow,
  CampaignImportPreview,
  InventorySourceRow,
  InventoryImportPreview,
  SellSideSourceRow,
  SellSideImportPreview,
  UnmatchedName,
  StatusClassification,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Result = { error?: string };

function toUnmatchedList(m: Map<string, number>): UnmatchedName[] {
  return [...m.entries()].map(([name, rowCount]) => ({ name, rowCount }));
}

async function saveNewStoreAliases(storeMappings: Record<string, string>, byStoreName: Map<string, string>) {
  const supabase = await createClient();
  const newAliases = Object.entries(storeMappings)
    .filter(([raw]) => raw && !byStoreName.has(normalizeName(raw)))
    .map(([raw_name, store_id]) => ({ raw_name: normalizeName(raw_name), store_id }));
  if (newAliases.length) await supabase.from("store_name_aliases").upsert(newAliases, { onConflict: "raw_name" });
  for (const a of newAliases) byStoreName.set(a.raw_name, a.store_id);
}

// ==================== Campaign Data ====================

export async function validateCampaignImport(rows: CampaignSourceRow[]): Promise<CampaignImportPreview> {
  await requireAdmin();
  const byStoreName = await buildStoreResolver();
  const unmatched = new Map<string, number>();
  let matchedCount = 0;
  const rowsOut = rows.map((raw, index) => {
    const storeId = byStoreName.get(normalizeName(raw.storeName)) ?? null;
    if (!storeId) unmatched.set(raw.storeName, (unmatched.get(raw.storeName) ?? 0) + 1);
    else matchedCount += 1;
    return { index, raw, storeId };
  });
  return { rows: rowsOut, unmatchedStores: toUnmatchedList(unmatched), matchedCount, totalCount: rows.length };
}

export async function applyCampaignImport(
  rows: CampaignSourceRow[],
  storeMappings: Record<string, string>,
): Promise<Result & { imported?: number }> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const byStoreName = await buildStoreResolver();
  await saveNewStoreAliases(storeMappings, byStoreName);

  const insertRows = rows.map((r) => ({
    month: `${r.month}-01`,
    week: r.week,
    raw_campaign_name: r.campaignName,
    raw_store_name: r.storeName,
    store_id: byStoreName.get(normalizeName(r.storeName)) ?? null,
    status: r.status,
  }));

  const { data: batch, error: batchError } = await supabase
    .from("contest_data_batches")
    .insert({ source_type: "campaign", origin: "csv", imported_by: profile.id, row_count: rows.length })
    .select("id")
    .single();
  if (batchError || !batch) return { error: batchError?.message ?? "Could not start import batch." };

  const { error } = await supabase
    .from("contest_campaign_rows")
    .insert(insertRows.map((r) => ({ ...r, batch_id: (batch as any).id })));
  if (error) return { error: error.message };

  await clearDummyData();
  revalidatePath("/contest-impact");
  return { imported: insertRows.length };
}

// ==================== Inventory Data ====================

export async function validateInventoryImport(rows: InventorySourceRow[]): Promise<InventoryImportPreview> {
  await requireAdmin();
  const byStoreName = await buildStoreResolver();
  const unmatched = new Map<string, number>();
  let matchedCount = 0;
  const rowsOut = rows.map((raw, index) => {
    const storeId = byStoreName.get(normalizeName(raw.storeName)) ?? null;
    if (!storeId) unmatched.set(raw.storeName, (unmatched.get(raw.storeName) ?? 0) + 1);
    else matchedCount += 1;
    return { index, raw, storeId };
  });
  return { rows: rowsOut, unmatchedStores: toUnmatchedList(unmatched), matchedCount, totalCount: rows.length };
}

export async function applyInventoryImport(
  rows: InventorySourceRow[],
  storeMappings: Record<string, string>,
): Promise<Result & { imported?: number }> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const byStoreName = await buildStoreResolver();
  await saveNewStoreAliases(storeMappings, byStoreName);

  const insertRows = rows.map((r) => ({
    month: `${r.month}-01`,
    week: r.week,
    raw_campaign_name: r.campaignName,
    raw_store_name: r.storeName,
    store_id: byStoreName.get(normalizeName(r.storeName)) ?? null,
    sku_id: r.skuId,
    product_name: r.productName,
    store_availability: r.storeAvailability,
    wh_availability: r.whAvailability,
  }));

  const { data: batch, error: batchError } = await supabase
    .from("contest_data_batches")
    .insert({ source_type: "inventory", origin: "csv", imported_by: profile.id, row_count: rows.length })
    .select("id")
    .single();
  if (batchError || !batch) return { error: batchError?.message ?? "Could not start import batch." };

  const { error } = await supabase
    .from("contest_inventory_rows")
    .insert(insertRows.map((r) => ({ ...r, batch_id: (batch as any).id })));
  if (error) return { error: error.message };

  await clearDummyData();
  revalidatePath("/contest-impact");
  return { imported: insertRows.length };
}

// ==================== Status classification ====================
// Which raw Status strings count as "approved execution" is a per-campaign
// call — captured here rather than assumed, since different campaigns use
// different vocabularies.

export async function classifyStatuses(campaignKey: string, classifications: StatusClassification[]): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const rows = classifications.map((c) => ({
    campaign_key: campaignKey,
    raw_status: c.rawStatus,
    is_approved: c.isApproved,
  }));
  const { error } = await supabase
    .from("contest_status_classification")
    .upsert(rows, { onConflict: "campaign_key,raw_status" });
  if (error) return { error: error.message };
  revalidatePath("/contest-impact");
  return {};
}

// ==================== Campaign Data — sync from a real Vero campaign ====================
// An alternative to the CSV upload, not a replacement — pulls Campaign Data
// straight from a Vero campaign's own tasks + submissions.

export async function previewVeroCampaignSync(campaignId: string, month: string): Promise<VeroCampaignSyncPreview> {
  await requireAdmin();
  return getVeroCampaignSyncPreview(campaignId, month);
}

export async function syncVeroCampaignData(
  campaignId: string,
  month: string,
  classifications: StatusClassification[],
): Promise<Result & { imported?: number }> {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const { data: campaign } = await supabase.from("campaigns").select("name").eq("id", campaignId).single();
  if (!campaign) return { error: "Campaign not found." };
  const campaignKey = normalizeName((campaign as any).name);

  if (classifications.length) {
    const rows = classifications.map((c) => ({
      campaign_key: campaignKey,
      raw_status: c.rawStatus,
      is_approved: c.isApproved,
    }));
    const { error: classifyError } = await supabase
      .from("contest_status_classification")
      .upsert(rows, { onConflict: "campaign_key,raw_status" });
    if (classifyError) return { error: classifyError.message };
  }

  const preview = await getVeroCampaignSyncPreview(campaignId, month);
  if (!preview.rows.length) return { error: "No reviewed submissions found for this campaign and month." };

  const monthDate = `${month}-01`;

  // Re-syncing replaces exactly this campaign's own rows for this month —
  // CSV-uploaded rows for other campaigns are untouched.
  const { error: deleteError } = await supabase
    .from("contest_campaign_rows")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("month", monthDate);
  if (deleteError) return { error: deleteError.message };

  const { data: batch, error: batchError } = await supabase
    .from("contest_data_batches")
    .insert({ source_type: "campaign", origin: "vero_sync", imported_by: profile.id, row_count: preview.rows.length })
    .select("id")
    .single();
  if (batchError || !batch) return { error: batchError?.message ?? "Could not start import batch." };

  const insertRows = preview.rows.map((r) => ({
    batch_id: (batch as any).id,
    month: monthDate,
    week: r.week,
    raw_campaign_name: preview.campaignName,
    raw_store_name: r.storeName,
    store_id: r.storeId,
    status: r.status,
    campaign_id: campaignId,
  }));

  const { error } = await supabase.from("contest_campaign_rows").insert(insertRows);
  if (error) return { error: error.message };

  await clearDummyData();
  revalidatePath("/contest-impact");
  return { imported: insertRows.length };
}

// ==================== Sell Side Data ====================

export async function validateSellSideImport(rows: SellSideSourceRow[]): Promise<SellSideImportPreview> {
  await requireAdmin();
  const byStoreName = await buildStoreResolver();
  const unmatched = new Map<string, number>();
  let matchedCount = 0;
  const rowsOut = rows.map((raw, index) => {
    const storeId = byStoreName.get(normalizeName(raw.storeName)) ?? null;
    if (!storeId) unmatched.set(raw.storeName, (unmatched.get(raw.storeName) ?? 0) + 1);
    else matchedCount += 1;
    return { index, raw, storeId };
  });
  return { rows: rowsOut, unmatchedStores: toUnmatchedList(unmatched), matchedCount, totalCount: rows.length };
}

export async function applySellSideImport(
  rows: SellSideSourceRow[],
  storeMappings: Record<string, string>,
): Promise<Result & { imported?: number }> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const byStoreName = await buildStoreResolver();
  await saveNewStoreAliases(storeMappings, byStoreName);

  const insertRows = rows.map((r) => ({
    month: `${r.month}-01`,
    week: r.week,
    raw_campaign_name: r.campaignName,
    raw_store_name: r.storeName,
    store_id: byStoreName.get(normalizeName(r.storeName)) ?? null,
    this_month_gmv: r.thisMonthGmv,
    last_month_gmv: r.lastMonthGmv,
    last_year_gmv: r.lastYearGmv,
    this_month_penetration: r.thisMonthPenetration,
    last_month_penetration: r.lastMonthPenetration,
    last_year_penetration: r.lastYearPenetration,
    this_month_avg_unit: r.thisMonthAvgUnit,
    last_month_avg_unit: r.lastMonthAvgUnit,
    last_year_avg_unit: r.lastYearAvgUnit,
    this_month_category_contribution: r.thisMonthCategoryContribution,
    last_month_category_contribution: r.lastMonthCategoryContribution,
    last_year_category_contribution: r.lastYearCategoryContribution,
    this_month_in_store_value: r.thisMonthInStoreValue,
    last_month_in_store_value: r.lastMonthInStoreValue,
    last_year_in_store_value: r.lastYearInStoreValue,
  }));

  const { data: batch, error: batchError } = await supabase
    .from("contest_data_batches")
    .insert({ source_type: "sell_side", origin: "csv", imported_by: profile.id, row_count: rows.length })
    .select("id")
    .single();
  if (batchError || !batch) return { error: batchError?.message ?? "Could not start import batch." };

  const { error } = await supabase
    .from("contest_sell_side_rows")
    .insert(insertRows.map((r) => ({ ...r, batch_id: (batch as any).id })));
  if (error) return { error: error.message };

  await clearDummyData();
  revalidatePath("/contest-impact");
  return { imported: insertRows.length };
}

// ==================== Contest chat ====================
// A campaign-and-month-scoped chatbot, restricted to answering from the
// underlying Contest Impact data — see chat.ts for the tool definitions and
// the system prompt that keeps it on-topic. History is per-user: nobody
// reads anyone else's thread.

export async function getContestChatHistory(campaignKey: string, month: string): Promise<ChatTurn[]> {
  const access = await requireAccess("contest_impact");
  const supabase = await createClient();
  const { data } = await supabase
    .from("contest_chat_messages")
    .select("role, content")
    .eq("user_id", access.profile.id)
    .eq("campaign_key", campaignKey)
    .eq("month", `${month}-01`)
    .order("created_at", { ascending: true });
  return ((data as any[]) ?? []).map((m) => ({ role: m.role, content: m.content }));
}

export async function sendContestChatMessage(campaignKey: string, month: string, message: string): Promise<{ reply?: string; error?: string }> {
  const access = await requireAccess("contest_impact");
  const trimmed = message.trim();
  if (!trimmed) return { error: "Type a question first." };

  const supabase = await createClient();
  const monthDate = `${month}-01`;

  const campaigns = await listCampaignOptions();
  const campaign = campaigns.find((c) => c.key === campaignKey);
  if (!campaign) return { error: "Unknown campaign." };

  const { data: historyRows } = await supabase
    .from("contest_chat_messages")
    .select("role, content")
    .eq("user_id", access.profile.id)
    .eq("campaign_key", campaignKey)
    .eq("month", monthDate)
    .order("created_at", { ascending: true });
  const history: ChatTurn[] = ((historyRows as any[]) ?? []).map((m) => ({ role: m.role, content: m.content }));

  const result = await runContestChatTurn({
    currentCampaignKey: campaign.key,
    currentCampaignLabel: campaign.label,
    currentMonth: month,
    history,
    userMessage: trimmed,
  });

  if ("error" in result) return { error: result.error };

  // Best-effort persistence — a logging failure shouldn't hide a good reply.
  await supabase.from("contest_chat_messages").insert([
    { user_id: access.profile.id, campaign_key: campaignKey, month: monthDate, role: "user", content: trimmed },
    { user_id: access.profile.id, campaign_key: campaignKey, month: monthDate, role: "assistant", content: result.reply },
  ]);

  return { reply: result.reply };
}

// ==================== "Is it working?" report ====================

export async function regenerateContestReport(campaignKey: string, month: string): Promise<ContestReport | { error: string }> {
  await requireAccess("contest_impact");

  const campaigns = await listCampaignOptions();
  const campaign = campaigns.find((c) => c.key === campaignKey);
  if (!campaign) return { error: "Unknown campaign." };

  const report = await getContestMonthReport(campaignKey, month);
  const result = await getOrGenerateContestReport(campaignKey, campaign.label, month, report, { force: true });
  revalidatePath("/contest-impact");
  return result;
}
