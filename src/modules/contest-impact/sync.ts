"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/db/server";
import { requireAdmin } from "@/core/auth/session";
import { fetchSheetTable } from "./sheets";
import { mapCampaignRows, mapInventoryRows, mapSellSideRows } from "./rows";
import type { CampaignSourceRow, InventorySourceRow, SellSideSourceRow } from "./types";

// Leg 2 of the Metabase/BigQuery → Sheet → Vero pipeline: this file is the
// Sheet → Vero half. It deliberately does NOT auto-import anything — every
// pull lands in the exact same preview/validate flow a CSV upload goes
// through (see components/import-client.tsx), so a bad Metabase export gets
// caught before it touches the database, not after. Wiring a scheduled,
// no-click pull is a separate, later step once Leg 1 (the Metabase → Sheet
// side) exists — see the standing plan.

const SETTINGS_KEYS = {
  spreadsheetId: "contest_impact_sheet_id",
  tabCampaign: "contest_impact_tab_campaign_status",
  tabInventory: "contest_impact_tab_inventory",
  tabSellSide: "contest_impact_tab_sell_side",
} as const;

const DEFAULT_TABS = {
  campaign: "Campaign Status",
  inventory: "Inventory",
  sellSide: "Sell Side",
};

export type SheetConfig = {
  spreadsheetId: string | null;
  tabCampaign: string;
  tabInventory: string;
  tabSellSide: string;
};

export async function getSheetConfig(): Promise<SheetConfig> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", Object.values(SETTINGS_KEYS));
  const byKey = new Map((data ?? []).map((r) => [r.key, r.value as string | null]));
  return {
    spreadsheetId: byKey.get(SETTINGS_KEYS.spreadsheetId) || null,
    tabCampaign: byKey.get(SETTINGS_KEYS.tabCampaign) || DEFAULT_TABS.campaign,
    tabInventory: byKey.get(SETTINGS_KEYS.tabInventory) || DEFAULT_TABS.inventory,
    tabSellSide: byKey.get(SETTINGS_KEYS.tabSellSide) || DEFAULT_TABS.sellSide,
  };
}

/** Accepts either a bare spreadsheet ID or a full Google Sheets URL — a
 * non-developer admin pasting a browser URL is the likely path, and
 * shouldn't have to know to strip it down first. */
function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

export async function saveSheetConfig(input: {
  spreadsheetUrlOrId: string;
  tabCampaign: string;
  tabInventory: string;
  tabSellSide: string;
}): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const spreadsheetId = extractSpreadsheetId(input.spreadsheetUrlOrId);
  if (!spreadsheetId) return { error: "Enter a spreadsheet URL or ID." };

  const rows = [
    { key: SETTINGS_KEYS.spreadsheetId, value: spreadsheetId },
    { key: SETTINGS_KEYS.tabCampaign, value: input.tabCampaign.trim() || DEFAULT_TABS.campaign },
    { key: SETTINGS_KEYS.tabInventory, value: input.tabInventory.trim() || DEFAULT_TABS.inventory },
    { key: SETTINGS_KEYS.tabSellSide, value: input.tabSellSide.trim() || DEFAULT_TABS.sellSide },
  ];
  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return { error: error.message };

  revalidatePath("/contest-impact/import");
  return {};
}

type SheetSyncResult<T> = { rows: T[]; error: string | null };

async function pullAndMap<T>(
  spreadsheetId: string | null,
  tabName: string,
  mapper: (table: string[][]) => { rows: T[]; error: string | null },
): Promise<SheetSyncResult<T>> {
  if (!spreadsheetId) {
    return { rows: [], error: "No Google Sheet is connected yet — add a Spreadsheet ID above first." };
  }
  const result = await fetchSheetTable(spreadsheetId, tabName);
  if ("error" in result) return { rows: [], error: result.error };
  return mapper(result.table);
}

export async function previewCampaignSheetSync(): Promise<SheetSyncResult<CampaignSourceRow>> {
  await requireAdmin();
  const config = await getSheetConfig();
  return pullAndMap(config.spreadsheetId, config.tabCampaign, mapCampaignRows);
}

export async function previewInventorySheetSync(): Promise<SheetSyncResult<InventorySourceRow>> {
  await requireAdmin();
  const config = await getSheetConfig();
  return pullAndMap(config.spreadsheetId, config.tabInventory, mapInventoryRows);
}

export async function previewSellSideSheetSync(): Promise<SheetSyncResult<SellSideSourceRow>> {
  await requireAdmin();
  const config = await getSheetConfig();
  return pullAndMap(config.spreadsheetId, config.tabSellSide, mapSellSideRows);
}
