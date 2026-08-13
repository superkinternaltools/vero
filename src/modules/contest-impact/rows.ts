import { normalizeHeader, parseNumber, parseDate } from "./csv";
import type { CampaignSourceRow, InventorySourceRow, SellSideSourceRow } from "./types";

/** Turns a raw table (header row + data rows) into typed source rows, for
 * all three contest sheets. Deliberately framework-agnostic and importable
 * from both a client component (CSV paste/upload, via parseCsv) and a
 * server action (a Google Sheets pull, via the Sheets API's own row arrays)
 * — the table shape is identical either way, so this is the ONE place the
 * column-name aliases and validation rules live. Duplicating this per
 * source of input would let the two paths quietly drift apart: a header
 * alias added for CSV uploads wouldn't apply to Sheets, or vice versa. */

export type MapResult<T> = { rows: T[]; error: string | null };

const CAMPAIGN_HEADERS: Record<string, string> = {
  date: "date",
  store_name: "storeName",
  store: "storeName",
  campaign_name: "campaignName",
  campaign: "campaignName",
  execution_brand: "campaignName",
  status: "status",
};

export function mapCampaignRows(table: string[][]): MapResult<CampaignSourceRow> {
  if (table.length < 2) return { rows: [], error: "No data rows found." };
  const header = table[0].map(normalizeHeader);
  const idx = new Map<string, number>();
  header.forEach((h, i) => {
    const key = CAMPAIGN_HEADERS[h];
    if (key) idx.set(key, i);
  });
  const required = ["date", "storeName", "campaignName", "status"];
  const missing = required.filter((k) => !idx.has(k));
  if (missing.length) return { rows: [], error: `Missing column(s): ${missing.join(", ")}` };
  const get = (r: string[], key: string) => (idx.has(key) ? (r[idx.get(key)!] ?? "") : "");
  let badDates = 0;
  const rows = table
    .slice(1)
    .map((r): CampaignSourceRow => {
      const date = parseDate(get(r, "date"));
      if (get(r, "date").trim() && !date) badDates += 1;
      return {
        date: date ?? "",
        storeName: get(r, "storeName").trim(),
        campaignName: get(r, "campaignName").trim(),
        status: get(r, "status").trim(),
      };
    })
    .filter((r) => r.storeName && r.campaignName && r.date && r.status);
  if (badDates) return { rows: [], error: `${badDates} row(s) have a date that isn't YYYY-MM-DD.` };
  return { rows, error: null };
}

const INVENTORY_HEADERS: Record<string, string> = {
  date: "date",
  store_name: "storeName",
  store: "storeName",
  campaign_name: "campaignName",
  campaign: "campaignName",
  execution_brand: "campaignName",
  sku_code: "skuCode",
  sku_name: "skuName",
  sku: "skuName",
  target_store_stock: "targetStoreStock",
  in_store_stock: "inStoreStock",
  target_warehouse_stock: "targetWarehouseStock",
  in_warehouse_stock: "inWarehouseStock",
};

export function mapInventoryRows(table: string[][]): MapResult<InventorySourceRow> {
  if (table.length < 2) return { rows: [], error: "No data rows found." };
  const header = table[0].map(normalizeHeader);
  const idx = new Map<string, number>();
  header.forEach((h, i) => {
    const key = INVENTORY_HEADERS[h];
    if (key) idx.set(key, i);
  });
  const required = ["date", "storeName", "campaignName", "skuCode", "skuName"];
  const missing = required.filter((k) => !idx.has(k));
  if (missing.length) return { rows: [], error: `Missing column(s): ${missing.join(", ")}` };
  const get = (r: string[], key: string) => (idx.has(key) ? (r[idx.get(key)!] ?? "") : "");
  let badDates = 0;
  const rows = table
    .slice(1)
    .map((r): InventorySourceRow => {
      const date = parseDate(get(r, "date"));
      if (get(r, "date").trim() && !date) badDates += 1;
      return {
        date: date ?? "",
        storeName: get(r, "storeName").trim(),
        campaignName: get(r, "campaignName").trim(),
        skuCode: get(r, "skuCode").trim(),
        skuName: get(r, "skuName").trim(),
        targetStoreStock: parseNumber(get(r, "targetStoreStock")),
        inStoreStock: parseNumber(get(r, "inStoreStock")),
        targetWarehouseStock: parseNumber(get(r, "targetWarehouseStock")),
        inWarehouseStock: parseNumber(get(r, "inWarehouseStock")),
      };
    })
    .filter((r) => r.storeName && r.campaignName && r.skuCode && r.skuName && r.date);
  if (badDates) return { rows: [], error: `${badDates} row(s) have a date that isn't YYYY-MM-DD.` };
  return { rows, error: null };
}

const SELL_SIDE_HEADERS: Record<string, string> = {
  date: "date",
  store_name: "storeName",
  store: "storeName",
  campaign_name: "campaignName",
  campaign: "campaignName",
  execution_brand: "campaignName",
  sku_code: "skuCode",
  sku_name: "skuName",
  sku: "skuName",
  units_sold: "thisMonthUnits",
  units_sold_lm: "lastMonthUnits",
  units_sold_ly: "lastYearUnits",
  this_month_gmv: "thisMonthGmv",
  gmv: "thisMonthGmv",
  last_month_gmv: "lastMonthGmv",
  gmv_lm: "lastMonthGmv",
  last_year_gmv: "lastYearGmv",
  gmv_ly: "lastYearGmv",
  this_month_customer_penetration: "thisMonthPenetration",
  this_month_penetration: "thisMonthPenetration",
  penetration: "thisMonthPenetration",
  last_month_customer_penetration: "lastMonthPenetration",
  last_month_penetration: "lastMonthPenetration",
  penetration_lm: "lastMonthPenetration",
  last_year_customer_penetration: "lastYearPenetration",
  last_year_penetration: "lastYearPenetration",
  penetration_ly: "lastYearPenetration",
  this_month_avg_unit: "thisMonthAvgUnit",
  avg_unit: "thisMonthAvgUnit",
  last_month_avg_unit: "lastMonthAvgUnit",
  avg_unit_lm: "lastMonthAvgUnit",
  last_year_avg_unit: "lastYearAvgUnit",
  avg_unit_ly: "lastYearAvgUnit",
  this_month_category_contribution: "thisMonthCategoryContribution",
  cat_contrib: "thisMonthCategoryContribution",
  last_month_category_contribution: "lastMonthCategoryContribution",
  cat_contrib_lm: "lastMonthCategoryContribution",
  last_year_category_contribution: "lastYearCategoryContribution",
  cat_contrib_ly: "lastYearCategoryContribution",
  in_store_value: "inStoreValue",
};

export function mapSellSideRows(table: string[][]): MapResult<SellSideSourceRow> {
  if (table.length < 2) return { rows: [], error: "No data rows found." };
  const header = table[0].map(normalizeHeader);
  const idx = new Map<string, number>();
  header.forEach((h, i) => {
    const key = SELL_SIDE_HEADERS[h];
    if (key) idx.set(key, i);
  });
  const required = ["date", "storeName", "campaignName", "skuCode", "skuName"];
  const missing = required.filter((k) => !idx.has(k));
  if (missing.length) return { rows: [], error: `Missing column(s): ${missing.join(", ")}` };
  const get = (r: string[], key: string) => (idx.has(key) ? (r[idx.get(key)!] ?? "") : "");
  let badDates = 0;
  const rows = table
    .slice(1)
    .map((r): SellSideSourceRow => {
      const date = parseDate(get(r, "date"));
      if (get(r, "date").trim() && !date) badDates += 1;
      return {
        date: date ?? "",
        storeName: get(r, "storeName").trim(),
        campaignName: get(r, "campaignName").trim(),
        skuCode: get(r, "skuCode").trim(),
        skuName: get(r, "skuName").trim(),
        thisMonthUnits: parseNumber(get(r, "thisMonthUnits")),
        lastMonthUnits: parseNumber(get(r, "lastMonthUnits")),
        lastYearUnits: parseNumber(get(r, "lastYearUnits")),
        thisMonthGmv: parseNumber(get(r, "thisMonthGmv")),
        lastMonthGmv: parseNumber(get(r, "lastMonthGmv")),
        lastYearGmv: parseNumber(get(r, "lastYearGmv")),
        thisMonthPenetration: parseNumber(get(r, "thisMonthPenetration")),
        lastMonthPenetration: parseNumber(get(r, "lastMonthPenetration")),
        lastYearPenetration: parseNumber(get(r, "lastYearPenetration")),
        thisMonthAvgUnit: parseNumber(get(r, "thisMonthAvgUnit")),
        lastMonthAvgUnit: parseNumber(get(r, "lastMonthAvgUnit")),
        lastYearAvgUnit: parseNumber(get(r, "lastYearAvgUnit")),
        thisMonthCategoryContribution: parseNumber(get(r, "thisMonthCategoryContribution")),
        lastMonthCategoryContribution: parseNumber(get(r, "lastMonthCategoryContribution")),
        lastYearCategoryContribution: parseNumber(get(r, "lastYearCategoryContribution")),
        inStoreValue: parseNumber(get(r, "inStoreValue")),
      };
    })
    .filter((r) => r.storeName && r.campaignName && r.skuCode && r.skuName && r.date);
  if (badDates) return { rows: [], error: `${badDates} row(s) have a date that isn't YYYY-MM-DD.` };
  return { rows, error: null };
}
