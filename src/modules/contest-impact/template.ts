"use server";

import { createClient } from "@/core/db/server";
import { requireAdmin } from "@/core/auth/session";
import { normalizeName } from "./queries";

// Generates pre-filled CSV templates for the three contest sheets: one row
// per store (+ SKU, for inventory/sell-side) per day, already keyed with the
// real store name, SKU code/name and date. The person filling it in only
// types numbers into the blank columns — store names and SKU codes can never
// drift out of sync with Vero, and a day with zero stock or zero sales can't
// go missing, because the row is already there waiting for a value.

type TemplateResult = { csv?: string; rowCount?: number; error?: string };

/** These three generators are exported "use server" actions, so they're
 * reachable directly over the network with whatever arguments a caller
 * sends — not only via the picker UI in front of them, which always supplies
 * a well-formed "YYYY-MM". An invalid month here would otherwise reach
 * `new Date("-01-01...")`, and calling `.toISOString()` on an Invalid Date
 * throws a RangeError — a 500, not a message the person filling the form
 * would understand. */
function badInput(campaignKey: string, campaignLabel: string, month: string): string | null {
  if (!campaignKey.trim() || !campaignLabel.trim()) return "No contest selected.";
  if (!/^\d{4}-\d{2}$/.test(month)) return "Pick a month.";
  const [, m] = month.split("-").map(Number);
  if (m < 1 || m > 12) return "That month doesn't exist.";
  return null;
}

/** Local copy of the pagination helper used throughout this module (see
 * queries.ts) — kept in sync there rather than imported, matching how the
 * rest of the codebase already duplicates this small helper per file. */
async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const results: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
  }
  return results;
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function csvLine(cells: string[]): string {
  return cells.map(csvCell).join(",");
}

/** Nothing bounds dates × stores × SKUs before a template gets built — a
 * contest with a large SKU list or a wide date range would otherwise stall
 * the request building a multi-hundred-thousand-row string with no feedback.
 * This is a backstop against that, not a limit anyone should routinely hit:
 * even a big contest (170 stores, 30 SKUs, a 59-day window) lands at ~300k,
 * comfortably under it. */
const MAX_TEMPLATE_ROWS = 750_000;

function tooManyRows(count: number): string | null {
  if (count <= MAX_TEMPLATE_ROWS) return null;
  return `That template would have ${count.toLocaleString()} rows — too many to generate at once. Pick a narrower date range or a shorter SKU list.`;
}

/** "2026-08" → the last day of that month, as "2026-08-31". Using day 0 of
 * the *next* month is the standard trick for this — Date normalizes it back
 * to the last day of the target month regardless of length or leap years. */
function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Every date from `startIso` to `endIso` inclusive. Guards against a
 * reversed or absurd range producing a silent multi-decade CSV rather than
 * an obvious error. */
function dateRange(startIso: string, endIso: string): string[] {
  if (startIso > endIso) return [];
  const out: string[] = [];
  let cur = startIso;
  let guard = 0;
  while (cur <= endIso) {
    out.push(cur);
    cur = addDays(cur, 1);
    if (++guard > 730) break; // two years — no legitimate template needs more
  }
  return out;
}

type Scope = { storeIds: string[]; skus: { code: string; name: string }[]; matchedCampaigns: number };

/** Real Vero campaigns whose name matches the contest key, unioned for their
 * store targeting and SKU list. Several campaign rows sharing one name is
 * the normal case (Brand Visibility months), not an edge case.
 *
 * A campaign matching by name but declaring no store scope at all is common
 * (store targeting is optional) — that falls back to every active store,
 * mirroring the same "no tag = visible to everyone" convention already used
 * for department scoping in campaigns/stats.ts. There is no equivalent
 * fallback for SKUs: an empty SKU list is a real gap, not an omission to
 * paper over, so it is returned as empty and the callers that need SKUs
 * refuse to generate a template rather than guess at a SKU list. */
async function resolveScope(campaignKey: string): Promise<Scope> {
  const supabase = await createClient();

  const nameRows = await fetchAllRows<{ id: string; name: string }>((from, to) =>
    supabase.from("campaigns").select("id, name").is("deleted_at", null).range(from, to),
  );
  const matchedIds = nameRows.filter((c) => normalizeName(c.name) === campaignKey).map((c) => c.id);

  if (!matchedIds.length) {
    const stores = await fetchAllRows<{ id: string }>((from, to) =>
      supabase.from("stores").select("id").is("deleted_at", null).range(from, to),
    );
    return { storeIds: stores.map((s) => s.id), skus: [], matchedCampaigns: 0 };
  }

  const [storeRows, skuRows] = await Promise.all([
    fetchAllRows<{ store_id: string }>((from, to) =>
      supabase.from("campaign_stores").select("store_id").in("campaign_id", matchedIds).range(from, to),
    ),
    fetchAllRows<{ sku_code: string; sku_name: string }>((from, to) =>
      supabase.from("campaign_skus").select("sku_code, sku_name").in("campaign_id", matchedIds).range(from, to),
    ),
  ]);

  let storeIds = [...new Set(storeRows.map((r) => r.store_id))];
  if (!storeIds.length) {
    const stores = await fetchAllRows<{ id: string }>((from, to) =>
      supabase.from("stores").select("id").is("deleted_at", null).range(from, to),
    );
    storeIds = stores.map((s) => s.id);
  }

  const skuByCode = new Map<string, string>();
  for (const r of skuRows) {
    const code = String(r.sku_code ?? "").trim().toUpperCase();
    if (code) skuByCode.set(code, r.sku_name ?? code);
  }
  const skus = [...skuByCode.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { storeIds, skus, matchedCampaigns: matchedIds.length };
}

/** Resolves store ids to names, dropping any that no longer resolve — e.g. a
 * store a campaign targeted that has since been soft-deleted. Silently
 * excluding it is correct here: a template row for a store that no longer
 * exists is useless, and the alternative (falling back to the raw id) would
 * put a UUID where a store name belongs — a row the importer couldn't fix
 * even if they wanted to. */
async function storeNames(storeIds: string[]): Promise<Map<string, string>> {
  if (!storeIds.length) return new Map();
  const supabase = await createClient();
  const rows = await fetchAllRows<{ id: string; name: string }>((from, to) =>
    supabase.from("stores").select("id, name").in("id", storeIds).is("deleted_at", null).range(from, to),
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ==================== Campaign status ====================

export async function generateCampaignStatusTemplate(
  campaignKey: string,
  campaignLabel: string,
  month: string,
): Promise<TemplateResult> {
  await requireAdmin();
  const invalid = badInput(campaignKey, campaignLabel, month);
  if (invalid) return { error: invalid };
  const scope = await resolveScope(campaignKey);
  if (!scope.storeIds.length) return { error: "No active stores found." };

  const names = await storeNames(scope.storeIds);
  const stores = scope.storeIds
    .filter((id) => names.has(id))
    .map((id) => names.get(id)!)
    .sort((a, b) => a.localeCompare(b));
  const dates = dateRange(`${month}-01`, monthEnd(month));
  const rowsError = tooManyRows(dates.length * stores.length);
  if (rowsError) return { error: rowsError };

  const lines = [csvLine(["date", "campaign", "store", "status"])];
  for (const date of dates) {
    for (const store of stores) lines.push(csvLine([date, campaignLabel, store, ""]));
  }
  return { csv: lines.join("\n"), rowCount: lines.length - 1 };
}

// ==================== Inventory ====================

export async function generateInventoryTemplate(
  campaignKey: string,
  campaignLabel: string,
  month: string,
): Promise<TemplateResult> {
  await requireAdmin();
  const invalid = badInput(campaignKey, campaignLabel, month);
  if (invalid) return { error: invalid };
  const scope = await resolveScope(campaignKey);
  if (!scope.storeIds.length) return { error: "No active stores found." };
  if (!scope.skus.length) {
    return {
      error:
        scope.matchedCampaigns === 0
          ? `No campaign named "${campaignLabel}" was found in Vero, so there's no SKU list to build a template from. Set it up under Brand Visibility first.`
          : `"${campaignLabel}" has no SKUs set up yet. Add its SKU list in Brand Visibility Setup before generating an inventory template.`,
    };
  }

  const names = await storeNames(scope.storeIds);
  const stores = scope.storeIds
    .filter((id) => names.has(id))
    .map((id) => names.get(id)!)
    .sort((a, b) => a.localeCompare(b));
  // Starts 28 days before the selected month so the report can compare
  // against a pre-contest period — see the parallel-trends check.
  const dates = dateRange(addDays(`${month}-01`, -28), monthEnd(month));
  const rowsError = tooManyRows(dates.length * stores.length * scope.skus.length);
  if (rowsError) return { error: rowsError };

  const lines = [
    csvLine([
      "date",
      "campaign",
      "store",
      "sku_code",
      "sku_name",
      "target_store_stock",
      "in_store_stock",
      "target_warehouse_stock",
      "in_warehouse_stock",
    ]),
  ];
  for (const date of dates) {
    for (const store of stores) {
      for (const sku of scope.skus) {
        lines.push(csvLine([date, campaignLabel, store, sku.code, sku.name, "", "", "", ""]));
      }
    }
  }
  return { csv: lines.join("\n"), rowCount: lines.length - 1 };
}

// ==================== Sell side ====================

export async function generateSellSideTemplate(
  campaignKey: string,
  campaignLabel: string,
  month: string,
): Promise<TemplateResult> {
  await requireAdmin();
  const invalid = badInput(campaignKey, campaignLabel, month);
  if (invalid) return { error: invalid };
  const scope = await resolveScope(campaignKey);
  if (!scope.storeIds.length) return { error: "No active stores found." };
  if (!scope.skus.length) {
    return {
      error:
        scope.matchedCampaigns === 0
          ? `No campaign named "${campaignLabel}" was found in Vero, so there's no SKU list to build a template from. Set it up under Brand Visibility first.`
          : `"${campaignLabel}" has no SKUs set up yet. Add its SKU list in Brand Visibility Setup before generating a sell-side template.`,
    };
  }

  const names = await storeNames(scope.storeIds);
  const stores = scope.storeIds
    .filter((id) => names.has(id))
    .map((id) => names.get(id)!)
    .sort((a, b) => a.localeCompare(b));
  const dates = dateRange(addDays(`${month}-01`, -28), monthEnd(month));
  const rowsError = tooManyRows(dates.length * stores.length * scope.skus.length);
  if (rowsError) return { error: rowsError };

  const lines = [
    csvLine([
      "date",
      "campaign",
      "store",
      "sku_code",
      "sku_name",
      "units_sold",
      "units_sold_lm",
      "units_sold_ly",
      "gmv",
      "gmv_lm",
      "gmv_ly",
      "penetration",
      "penetration_lm",
      "penetration_ly",
      "avg_unit",
      "avg_unit_lm",
      "avg_unit_ly",
      "cat_contrib",
      "cat_contrib_lm",
      "cat_contrib_ly",
      "in_store_value",
    ]),
  ];
  // 5 identifying columns (date, campaign, store, sku_code, sku_name) + 16
  // data columns = 21 header cells — this must match that count exactly, or
  // every generated row is one field short of its header.
  const blanks = Array(16).fill("");
  for (const date of dates) {
    for (const store of stores) {
      for (const sku of scope.skus) {
        lines.push(csvLine([date, campaignLabel, store, sku.code, sku.name, ...blanks]));
      }
    }
  }
  return { csv: lines.join("\n"), rowCount: lines.length - 1 };
}
