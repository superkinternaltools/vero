"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";
import { requireAdmin } from "@/core/auth/session";
import { buildNameResolvers, normalizeName } from "./queries";
import type {
  ImportSourceRow,
  ImportPreview,
  UnmatchedName,
  HistoricalRow,
  HistoricalPreviewRow,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Result = { error?: string };

export async function validateImport(rows: ImportSourceRow[]): Promise<ImportPreview> {
  await requireAdmin();
  const { byCampaignName, byStoreName } = await buildNameResolvers();

  const unmatchedCampaignCounts = new Map<string, number>();
  const unmatchedStoreCounts = new Map<string, number>();
  let matchedCount = 0;

  const rowsOut = rows.map((raw, index) => {
    const campaignId = byCampaignName.get(normalizeName(raw.campaignName)) ?? null;
    const storeId = byStoreName.get(normalizeName(raw.storeName)) ?? null;
    if (!campaignId)
      unmatchedCampaignCounts.set(raw.campaignName, (unmatchedCampaignCounts.get(raw.campaignName) ?? 0) + 1);
    if (!storeId)
      unmatchedStoreCounts.set(raw.storeName, (unmatchedStoreCounts.get(raw.storeName) ?? 0) + 1);
    if (campaignId && storeId) matchedCount += 1;
    return { index, raw, campaignId, storeId };
  });

  const toList = (m: Map<string, number>): UnmatchedName[] =>
    [...m.entries()].map(([name, rowCount]) => ({ name, rowCount }));

  return {
    rows: rowsOut,
    unmatchedCampaigns: toList(unmatchedCampaignCounts),
    unmatchedStores: toList(unmatchedStoreCounts),
    matchedCount,
    totalCount: rows.length,
  };
}

export async function applyImport(
  rows: ImportSourceRow[],
  mappings: { campaigns: Record<string, string>; stores: Record<string, string> },
): Promise<Result & { imported?: number }> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { byCampaignName, byStoreName } = await buildNameResolvers();

  // Any mapping the admin just picked for a name we didn't already know is
  // saved as an alias, so the same name resolves automatically next time.
  const newCampaignAliases = Object.entries(mappings.campaigns)
    .filter(([raw]) => !byCampaignName.has(normalizeName(raw)))
    .map(([raw_name, campaign_id]) => ({ raw_name: normalizeName(raw_name), campaign_id }));
  const newStoreAliases = Object.entries(mappings.stores)
    .filter(([raw]) => !byStoreName.has(normalizeName(raw)))
    .map(([raw_name, store_id]) => ({ raw_name: normalizeName(raw_name), store_id }));

  if (newCampaignAliases.length)
    await supabase.from("campaign_name_aliases").upsert(newCampaignAliases, { onConflict: "raw_name" });
  if (newStoreAliases.length)
    await supabase.from("store_name_aliases").upsert(newStoreAliases, { onConflict: "raw_name" });

  for (const a of newCampaignAliases) byCampaignName.set(a.raw_name, a.campaign_id);
  for (const a of newStoreAliases) byStoreName.set(a.raw_name, a.store_id);

  let unmatchedCampaignCount = 0;
  let unmatchedStoreCount = 0;
  const perfRows = rows.map((r) => {
    const campaignId = byCampaignName.get(normalizeName(r.campaignName)) ?? null;
    const storeId = byStoreName.get(normalizeName(r.storeName)) ?? null;
    if (!campaignId) unmatchedCampaignCount += 1;
    if (!storeId) unmatchedStoreCount += 1;
    return {
      month: `${r.month}-01`,
      week_of_month: r.weekOfMonth,
      raw_campaign_name: r.campaignName,
      campaign_id: campaignId,
      raw_store_name: r.storeName,
      store_id: storeId,
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
    };
  });

  const { data: batch, error: batchError } = await supabase
    .from("performance_import_batches")
    .insert({
      source: "csv",
      imported_by: profile.id,
      row_count: rows.length,
      unmatched_campaign_count: unmatchedCampaignCount,
      unmatched_store_count: unmatchedStoreCount,
    })
    .select("id")
    .single();
  if (batchError || !batch) return { error: batchError?.message ?? "Could not start import batch." };

  const { error } = await supabase
    .from("store_weekly_performance")
    .insert(perfRows.map((r) => ({ ...r, import_batch_id: (batch as any).id })));
  if (error) return { error: error.message };

  revalidatePath("/contest-impact");
  return { imported: perfRows.length };
}

export async function validateHistoricalImport(rows: HistoricalRow[]): Promise<{ preview: HistoricalPreviewRow[] }> {
  await requireAdmin();
  const { byStoreName } = await buildNameResolvers();

  const preview = rows.map((raw, index): HistoricalPreviewRow => {
    const errors: string[] = [];
    const storeId = byStoreName.get(normalizeName(raw.storeName)) ?? null;
    if (!storeId) errors.push("store not found");
    if (!raw.campaignName.trim()) errors.push("missing campaign name");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.weekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(raw.weekEnd))
      errors.push("bad dates");
    if (!["approved", "rejected", "missed"].includes(raw.verdict)) errors.push("bad verdict");
    return { index, raw, storeId, ok: errors.length === 0, error: errors.length ? errors.join(", ") : null };
  });
  return { preview };
}

export async function applyHistoricalImport(
  rows: HistoricalRow[],
  storeMappings: Record<string, string>,
): Promise<Result & { created?: number }> {
  await requireAdmin();
  const supabase = await createClient();
  const { byCampaignName, byStoreName } = await buildNameResolvers();

  const byCampaign = new Map<string, HistoricalRow[]>();
  for (const r of rows) {
    const key = normalizeName(r.campaignName);
    const list = byCampaign.get(key) ?? [];
    list.push(r);
    byCampaign.set(key, list);
  }

  // A campaign name that doesn't already exist becomes a new completed
  // campaign, sized to the full date range of the rows referencing it.
  const campaignIdByKey = new Map<string, string>(byCampaignName);
  for (const [key, group] of byCampaign) {
    if (campaignIdByKey.has(key)) continue;
    const start = [...group].map((r) => r.weekStart).sort()[0];
    const end = [...group].map((r) => r.weekEnd).sort().slice(-1)[0];
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        name: group[0].campaignName.trim(),
        frequency: "weekly",
        status: "completed",
        start_date: start,
        end_date: end,
      })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Could not create historical campaign." };
    campaignIdByKey.set(key, (data as any).id);
  }

  const taskRows = rows
    .map((r) => {
      const storeId = storeMappings[r.storeName] ?? byStoreName.get(normalizeName(r.storeName));
      const campaignId = campaignIdByKey.get(normalizeName(r.campaignName));
      if (!storeId || !campaignId) return null;
      return {
        campaign_id: campaignId,
        store_id: storeId,
        cycle_start: r.weekStart,
        cycle_end: r.weekEnd,
        due_date: r.weekEnd,
        status: r.verdict,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  const { error } = await supabase.from("tasks").upsert(taskRows, { onConflict: "campaign_id,store_id,due_date" });
  if (error) return { error: error.message };

  revalidatePath("/contest-impact");
  return { created: taskRows.length };
}
