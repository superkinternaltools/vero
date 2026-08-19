"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";
import { requireAdmin } from "@/core/auth/session";
import { buildStoreResolver, normalizeName } from "./queries";
import { clearDummyData } from "./seed";
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
    day: r.day,
    raw_campaign_name: r.campaignName,
    raw_store_name: r.storeName,
    store_id: byStoreName.get(normalizeName(r.storeName)) ?? null,
    sku_name: r.skuName,
    target_store_stock: r.targetStoreStock,
    in_store_stock: r.inStoreStock,
    target_warehouse_stock: r.targetWarehouseStock,
    in_warehouse_stock: r.inWarehouseStock,
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
    in_store_value: r.inStoreValue,
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
