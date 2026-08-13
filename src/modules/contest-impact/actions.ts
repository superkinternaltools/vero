"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";
import { requireAdmin } from "@/core/auth/session";
import { buildStoreResolver, normalizeName } from "./queries";
import { monthStartOf } from "./csv";
import { clearDummyData } from "./seed";
import type {
  CampaignSourceRow,
  CampaignImportPreview,
  InventorySourceRow,
  InventoryImportPreview,
  SellSideSourceRow,
  SellSideImportPreview,
  UnmatchedName,
  UnknownSku,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Result = { error?: string };

function toUnmatchedList(m: Map<string, number>): UnmatchedName[] {
  return [...m.entries()].map(([name, rowCount]) => ({ name, rowCount }));
}

function toUnknownSkuList(m: Map<string, number>): UnknownSku[] {
  return [...m.entries()].map(([code, rowCount]) => ({ code, rowCount }));
}

async function saveNewStoreAliases(storeMappings: Record<string, string>, byStoreName: Map<string, string>) {
  const supabase = await createClient();
  const newAliases = Object.entries(storeMappings)
    .filter(([raw]) => raw && !byStoreName.has(normalizeName(raw)))
    .map(([raw_name, store_id]) => ({ raw_name: normalizeName(raw_name), store_id }));
  if (newAliases.length) await supabase.from("store_name_aliases").upsert(newAliases, { onConflict: "raw_name" });
  for (const a of newAliases) byStoreName.set(a.raw_name, a.store_id);
}

// ==================== SKU resolution ====================

/** Normalized campaign name → the set of SKU codes that campaign declares.
 *
 * A campaign with no SKU list is deliberately ABSENT from this map rather than
 * present-and-empty. Absent means "can't check", not "nothing is allowed" —
 * the contest sheets match campaigns by name and may legitimately name a
 * campaign Vero has no SKU list for. Those rows import unchecked instead of
 * being rejected wholesale.
 *
 * Several campaigns can normalize to the same name (a contest's months often
 * share one), so codes are unioned across them. */
async function buildSkuResolver(): Promise<Map<string, Set<string>>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("name, campaign_skus ( sku_code )")
    .is("deleted_at", null);

  const out = new Map<string, Set<string>>();
  for (const c of ((data as any[]) ?? [])) {
    const codes = ((c.campaign_skus as any[]) ?? [])
      .map((s) => String(s.sku_code ?? "").trim().toUpperCase())
      .filter(Boolean);
    if (!codes.length) continue;
    const key = normalizeName(c.name);
    const set = out.get(key) ?? new Set<string>();
    for (const code of codes) set.add(code);
    out.set(key, set);
  }
  return out;
}

type SkuCheck = { unknown: Map<string, number>; keep: (i: number) => boolean };

function checkSkus(
  rows: { campaignName: string; skuCode: string }[],
  resolver: Map<string, Set<string>>,
): SkuCheck {
  const unknown = new Map<string, number>();
  const rejected = new Set<number>();
  rows.forEach((r, i) => {
    const allowed = resolver.get(normalizeName(r.campaignName));
    if (!allowed) return; // campaign has no SKU list — nothing to check against
    if (allowed.has(r.skuCode.trim().toUpperCase())) return;
    rejected.add(i);
    unknown.set(r.skuCode, (unknown.get(r.skuCode) ?? 0) + 1);
  });
  return { unknown, keep: (i) => !rejected.has(i) };
}

// ==================== shared insert ====================

/** A month of daily SKU-level data is tens of thousands of rows — far past
 * what one insert can carry — so it goes in chunks. If any chunk fails, the
 * rows already written are deleted by batch_id so a half-imported day can't
 * quietly skew every median that reads it. */
const INSERT_CHUNK = 1000;

async function insertBatched(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  batchId: string,
  rows: Record<string, unknown>[],
): Promise<string | null> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK).map((r) => ({ ...r, batch_id: batchId }));
    const { error } = await supabase.from(table).insert(chunk);
    if (error) {
      await supabase.from(table).delete().eq("batch_id", batchId);
      await supabase.from("contest_data_batches").delete().eq("id", batchId);
      return `${error.message} — nothing was imported (${i} rows rolled back).`;
    }
  }
  return null;
}

async function startBatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceType: "campaign" | "inventory" | "sell_side",
  importedBy: string,
  rowCount: number,
): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase
    .from("contest_data_batches")
    .insert({ source_type: sourceType, origin: "csv", imported_by: importedBy, row_count: rowCount })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not start import batch." };
  return { id: (data as any).id as string };
}

/** Every daily insert writes `date` and leaves `week` NULL — that NULL is what
 * keeps these rows invisible to the existing weekly queries (see 0027). */
function grainColumns(date: string) {
  return { month: monthStartOf(date), date, week: null as number | null };
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
  return {
    rows: rowsOut,
    unmatchedStores: toUnmatchedList(unmatched),
    unknownSkus: [],
    matchedCount,
    totalCount: rows.length,
  };
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
    ...grainColumns(r.date),
    raw_campaign_name: r.campaignName,
    raw_store_name: r.storeName,
    store_id: byStoreName.get(normalizeName(r.storeName)) ?? null,
    status: r.status,
  }));

  const batch = await startBatch(supabase, "campaign", profile.id, insertRows.length);
  if (!batch.id) return { error: batch.error };

  const error = await insertBatched(supabase, "contest_campaign_rows", batch.id, insertRows);
  if (error) return { error };

  await clearDummyData();
  revalidatePath("/contest-impact");
  return { imported: insertRows.length };
}

// ==================== Inventory Data ====================

export async function validateInventoryImport(rows: InventorySourceRow[]): Promise<InventoryImportPreview> {
  await requireAdmin();
  const [byStoreName, skuResolver] = await Promise.all([buildStoreResolver(), buildSkuResolver()]);
  const { unknown, keep } = checkSkus(rows, skuResolver);

  const unmatched = new Map<string, number>();
  let matchedCount = 0;
  const rowsOut = rows.map((raw, index) => {
    const storeId = byStoreName.get(normalizeName(raw.storeName)) ?? null;
    if (!storeId) unmatched.set(raw.storeName, (unmatched.get(raw.storeName) ?? 0) + 1);
    else if (keep(index)) matchedCount += 1;
    return { index, raw, storeId };
  });

  return {
    rows: rowsOut,
    unmatchedStores: toUnmatchedList(unmatched),
    unknownSkus: toUnknownSkuList(unknown),
    matchedCount,
    totalCount: rows.length,
  };
}

export async function applyInventoryImport(
  rows: InventorySourceRow[],
  storeMappings: Record<string, string>,
): Promise<Result & { imported?: number }> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const [byStoreName, skuResolver] = await Promise.all([buildStoreResolver(), buildSkuResolver()]);
  await saveNewStoreAliases(storeMappings, byStoreName);
  const { keep } = checkSkus(rows, skuResolver);

  const insertRows = rows
    .filter((_, i) => keep(i))
    .map((r) => ({
      ...grainColumns(r.date),
      raw_campaign_name: r.campaignName,
      raw_store_name: r.storeName,
      store_id: byStoreName.get(normalizeName(r.storeName)) ?? null,
      sku_code: r.skuCode.trim().toUpperCase(),
      sku_name: r.skuName,
      target_store_stock: r.targetStoreStock,
      in_store_stock: r.inStoreStock,
      target_warehouse_stock: r.targetWarehouseStock,
      in_warehouse_stock: r.inWarehouseStock,
    }));

  if (!insertRows.length) return { error: "Every row was rejected — nothing left to import." };

  const batch = await startBatch(supabase, "inventory", profile.id, insertRows.length);
  if (!batch.id) return { error: batch.error };

  const error = await insertBatched(supabase, "contest_inventory_rows", batch.id, insertRows);
  if (error) return { error };

  await clearDummyData();
  revalidatePath("/contest-impact");
  return { imported: insertRows.length };
}

// ==================== Sell Side Data ====================

export async function validateSellSideImport(rows: SellSideSourceRow[]): Promise<SellSideImportPreview> {
  await requireAdmin();
  const [byStoreName, skuResolver] = await Promise.all([buildStoreResolver(), buildSkuResolver()]);
  const { unknown, keep } = checkSkus(rows, skuResolver);

  const unmatched = new Map<string, number>();
  let matchedCount = 0;
  const rowsOut = rows.map((raw, index) => {
    const storeId = byStoreName.get(normalizeName(raw.storeName)) ?? null;
    if (!storeId) unmatched.set(raw.storeName, (unmatched.get(raw.storeName) ?? 0) + 1);
    else if (keep(index)) matchedCount += 1;
    return { index, raw, storeId };
  });

  return {
    rows: rowsOut,
    unmatchedStores: toUnmatchedList(unmatched),
    unknownSkus: toUnknownSkuList(unknown),
    matchedCount,
    totalCount: rows.length,
  };
}

export async function applySellSideImport(
  rows: SellSideSourceRow[],
  storeMappings: Record<string, string>,
): Promise<Result & { imported?: number }> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const [byStoreName, skuResolver] = await Promise.all([buildStoreResolver(), buildSkuResolver()]);
  await saveNewStoreAliases(storeMappings, byStoreName);
  const { keep } = checkSkus(rows, skuResolver);

  const insertRows = rows
    .filter((_, i) => keep(i))
    .map((r) => ({
      ...grainColumns(r.date),
      raw_campaign_name: r.campaignName,
      raw_store_name: r.storeName,
      store_id: byStoreName.get(normalizeName(r.storeName)) ?? null,
      sku_code: r.skuCode.trim().toUpperCase(),
      sku_name: r.skuName,
      this_month_units: r.thisMonthUnits,
      last_month_units: r.lastMonthUnits,
      last_year_units: r.lastYearUnits,
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

  if (!insertRows.length) return { error: "Every row was rejected — nothing left to import." };

  const batch = await startBatch(supabase, "sell_side", profile.id, insertRows.length);
  if (!batch.id) return { error: batch.error };

  const error = await insertBatched(supabase, "contest_sell_side_rows", batch.id, insertRows);
  if (error) return { error };

  await clearDummyData();
  revalidatePath("/contest-impact");
  return { imported: insertRows.length };
}
