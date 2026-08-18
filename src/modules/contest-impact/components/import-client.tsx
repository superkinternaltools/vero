"use client";

import { useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { SelectSearch } from "@/core/ui/select-search";
import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";
import { parseCsv, normalizeHeader, parseNumber, parseMonth, parseSheetDate } from "../csv";
import {
  validateCampaignImport,
  applyCampaignImport,
  validateInventoryImport,
  applyInventoryImport,
  validateSellSideImport,
  applySellSideImport,
} from "../actions";
import type {
  CampaignSourceRow,
  InventorySourceRow,
  SellSideSourceRow,
  NameOption,
  UnmatchedName,
} from "../types";

type Preview = { unmatchedStores: UnmatchedName[]; matchedCount: number; totalCount: number };

// ==================== per-source header maps + parsers ====================

const CAMPAIGN_HEADERS: Record<string, string> = {
  month: "month",
  week: "week",
  week_of_month: "week",
  store_name: "storeName",
  store: "storeName",
  campaign_name: "campaignName",
  campaign: "campaignName",
  execution_brand: "campaignName",
  status: "status",
};

function parseCampaignRows(text: string, year: number): { rows: CampaignSourceRow[]; error: string | null } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: "No data rows found." };
  const header = table[0].map(normalizeHeader);
  const idx = new Map<string, number>();
  header.forEach((h, i) => {
    const key = CAMPAIGN_HEADERS[h];
    if (key) idx.set(key, i);
  });
  const required = ["month", "week", "storeName", "campaignName", "status"];
  const missing = required.filter((k) => !idx.has(k));
  if (missing.length) return { rows: [], error: `Missing column(s): ${missing.join(", ")}` };
  const get = (r: string[], key: string) => (idx.has(key) ? (r[idx.get(key)!] ?? "") : "");
  const rows = table
    .slice(1)
    .map(
      (r): CampaignSourceRow => ({
        month: parseMonth(get(r, "month"), year) ?? "",
        week: Number(get(r, "week")) || 0,
        storeName: get(r, "storeName").trim(),
        campaignName: get(r, "campaignName").trim(),
        status: get(r, "status").trim(),
      }),
    )
    .filter((r) => r.storeName && r.campaignName && r.month && r.week && r.week <= 4 && r.status);
  return { rows, error: null };
}

const INVENTORY_HEADERS: Record<string, string> = {
  month: "month",
  week: "week",
  week_of_month: "week",
  store_name: "storeName",
  store: "storeName",
  campaign_name: "campaignName",
  campaign: "campaignName",
  execution_brand: "campaignName",
  sku_name: "skuName",
  sku: "skuName",
  // The inventory sheet carries a real date per row where the other two
  // carry a week number — month and week get derived from it below.
  day: "date",
  date: "date",
  target_store_stock: "targetStoreStock",
  in_store_stock: "inStoreStock",
  target_warehouse_stock: "targetWarehouseStock",
  in_warehouse_stock: "inWarehouseStock",
};

function parseInventoryRows(
  text: string,
  year: number,
): { rows: InventorySourceRow[]; error: string | null; skippedAfterCutoff?: number } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: "No data rows found." };
  const header = table[0].map(normalizeHeader);
  const idx = new Map<string, number>();
  header.forEach((h, i) => {
    const key = INVENTORY_HEADERS[h];
    if (key) idx.set(key, i);
  });

  // A `Day` column supplies month and week on its own, so neither is required
  // when it's present — that's the shape the inventory sheet actually has.
  const hasDate = idx.has("date");
  const required = hasDate
    ? ["date", "storeName", "campaignName", "skuName"]
    : ["month", "week", "storeName", "campaignName", "skuName"];
  const missing = required.filter((k) => !idx.has(k));
  if (missing.length) {
    return {
      rows: [],
      error: `Missing column(s): ${missing.join(", ")}. Inventory needs either a Day column, or Month plus Week.`,
    };
  }

  const get = (r: string[], key: string) => (idx.has(key) ? (r[idx.get(key)!] ?? "") : "");
  let badDates = 0;
  let afterCutoff = 0;
  const rows = table
    .slice(1)
    .map((r): InventorySourceRow => {
      let month = "";
      let week = 0;
      let day: string | null = null;
      if (hasDate) {
        const raw = get(r, "date").trim();
        const d = parseSheetDate(raw);
        if (raw && !d) badDates += 1;
        // A contest month ends on the 28th, so days 29–31 have no week to
        // belong to and are counted out rather than folded into week 4.
        if (d && d.week === null) afterCutoff += 1;
        month = d?.month ?? "";
        week = d?.week ?? 0;
        day = d?.iso ?? null;
      } else {
        month = parseMonth(get(r, "month"), year) ?? "";
        week = Number(get(r, "week")) || 0;
      }
      return {
        month,
        week,
        day,
        storeName: get(r, "storeName").trim(),
        campaignName: get(r, "campaignName").trim(),
        skuName: get(r, "skuName").trim(),
        targetStoreStock: parseNumber(get(r, "targetStoreStock")),
        inStoreStock: parseNumber(get(r, "inStoreStock")),
        targetWarehouseStock: parseNumber(get(r, "targetWarehouseStock")),
        inWarehouseStock: parseNumber(get(r, "inWarehouseStock")),
      };
    })
    .filter((r) => r.storeName && r.campaignName && r.skuName && r.month && r.week);

  if (badDates) {
    return { rows: [], error: `${badDates} row(s) have a Day value that couldn't be read. Expected e.g. "13 Jul, 2026".` };
  }
  return { rows, error: null, skippedAfterCutoff: afterCutoff };
}

const SELL_SIDE_HEADERS: Record<string, string> = {
  month: "month",
  week: "week",
  week_of_month: "week",
  store_name: "storeName",
  store: "storeName",
  campaign_name: "campaignName",
  campaign: "campaignName",
  execution_brand: "campaignName",
  this_month_gmv: "thisMonthGmv",
  last_month_gmv: "lastMonthGmv",
  last_year_gmv: "lastYearGmv",
  this_month_customer_penetration: "thisMonthPenetration",
  this_month_penetration: "thisMonthPenetration",
  last_month_customer_penetration: "lastMonthPenetration",
  last_month_penetration: "lastMonthPenetration",
  last_year_customer_penetration: "lastYearPenetration",
  last_year_penetration: "lastYearPenetration",
  this_month_avg_unit: "thisMonthAvgUnit",
  last_month_avg_unit: "lastMonthAvgUnit",
  last_year_avg_unit: "lastYearAvgUnit",
  this_month_category_contribution: "thisMonthCategoryContribution",
  last_month_category_contribution: "lastMonthCategoryContribution",
  last_year_category_contribution: "lastYearCategoryContribution",
  in_store_value: "inStoreValue",
};

function parseSellSideRows(text: string, year: number): { rows: SellSideSourceRow[]; error: string | null } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: "No data rows found." };
  const header = table[0].map(normalizeHeader);
  const idx = new Map<string, number>();
  header.forEach((h, i) => {
    const key = SELL_SIDE_HEADERS[h];
    if (key) idx.set(key, i);
  });
  const required = ["month", "week", "storeName", "campaignName"];
  const missing = required.filter((k) => !idx.has(k));
  if (missing.length) return { rows: [], error: `Missing column(s): ${missing.join(", ")}` };
  const get = (r: string[], key: string) => (idx.has(key) ? (r[idx.get(key)!] ?? "") : "");
  const rows = table
    .slice(1)
    .map(
      (r): SellSideSourceRow => ({
        month: parseMonth(get(r, "month"), year) ?? "",
        week: Number(get(r, "week")) || 0,
        storeName: get(r, "storeName").trim(),
        campaignName: get(r, "campaignName").trim(),
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
      }),
    )
    .filter((r) => r.storeName && r.campaignName && r.month && r.week && r.week <= 4);
  return { rows, error: null };
}

// ==================== shared card ====================

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" }) {
  return (
    <div className="min-w-32 flex-1 rounded-xl border border-border bg-card px-4 py-2.5">
      <div className={cn("text-xl font-bold tabular-nums", tone === "success" && "text-success", tone === "warning" && "text-warning")}>
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function MappingRow({
  raw,
  rowCount,
  options,
  value,
  onChange,
}: {
  raw: string;
  rowCount: number;
  options: NameOption[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
      <span className="rounded-lg bg-danger/10 px-2 py-1 font-mono text-xs text-danger">&quot;{raw}&quot;</span>
      <span className="text-xs text-muted-foreground">{rowCount} row{rowCount === 1 ? "" : "s"}</span>
      <span className="text-muted-foreground">→</span>
      <div className="min-w-56 flex-1">
        <SelectSearch options={options} value={value} onChange={onChange} placeholder="Map to…" />
      </div>
    </div>
  );
}

function SourceImportCard<T extends { storeName: string }>({
  title,
  description,
  headers,
  stores,
  parseRows,
  validateAction,
  applyAction,
}: {
  title: string;
  description: string;
  headers: string[];
  stores: NameOption[];
  parseRows: (text: string, year: number) => { rows: T[]; error: string | null; skippedAfterCutoff?: number };
  validateAction: (rows: T[]) => Promise<Preview>;
  applyAction: (rows: T[], mappings: Record<string, string>) => Promise<{ error?: string; imported?: number }>;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<T[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [storeMappings, setStoreMappings] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [isPending, startTransition] = useTransition();
  // The sheets say "July" with no year, so it has to be supplied once per
  // upload. Ignored when a column already carries a full date.
  const [year, setYear] = useState<number>(() => new Date().getFullYear());

  function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const { rows: parsed, error, skippedAfterCutoff } = parseRows(text, year);
      setParseError(error);
      setSkipped(skippedAfterCutoff ?? 0);
      setRows(parsed);
      setPreview(null);
      if (!error && parsed.length) {
        startTransition(async () => {
          const p = await validateAction(parsed);
          setPreview(p);
        });
      }
    };
    reader.readAsText(file);
  }

  function handleApply() {
    startTransition(async () => {
      const res = await applyAction(rows, storeMappings);
      setResult(res.error ? `Error: ${res.error}` : `Imported ${res.imported} rows.`);
      if (!res.error) {
        setRows([]);
        setPreview(null);
        setFileName(null);
        setStoreMappings({});
      }
    });
  }

  const canImport =
    !isPending && preview != null && rows.length > 0 && preview.unmatchedStores.every((u) => storeMappings[u.name]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-xl text-xs text-muted-foreground">{description}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {headers.map((h) => (
          <span key={h} className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary">
            {h}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-dashed border-border p-4 opacity-55">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            Google Sheet
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">Phase 2</span>
          </p>
          <div className="flex gap-2">
            <input disabled placeholder="Paste sheet URL…" className="flex-1 rounded-lg border border-border bg-input px-2.5 py-1.5 text-xs" />
            <Button variant="outline" size="md" disabled>
              Connect
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Upload CSV</p>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-input px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-foreground">
            <Upload className="h-3.5 w-3.5" />
            {fileName ?? "Choose a CSV file…"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor={`year-${title}`} className="text-[11px] text-muted-foreground">
              Year of this sheet
            </label>
            <input
              id={`year-${title}`}
              type="number"
              value={year}
              min={2000}
              max={2100}
              onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())}
              className="w-20 rounded-lg border border-border bg-input px-2 py-1 text-xs text-foreground"
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            The sheets say &quot;July&quot; without a year. Set this before choosing the file.
          </p>
        </div>
      </div>

      {parseError && <p className="mt-3 text-sm text-danger">{parseError}</p>}
      {!parseError && skipped > 0 && (
        <p className="mt-3 text-sm text-warning">
          {skipped} row{skipped === 1 ? "" : "s"} fell after the 28th and {skipped === 1 ? "was" : "were"} skipped — a
          contest month runs to the 28th, so those days have no week to belong to.
        </p>
      )}
      {result && <p className="mt-3 text-sm font-medium text-foreground">{result}</p>}

      {preview && (
        <>
          <div className="mt-4 flex flex-wrap gap-3">
            <Stat label="rows read" value={preview.totalCount} />
            <Stat label="matched cleanly" value={preview.matchedCount} tone="success" />
            <Stat
              label="stores need mapping"
              value={preview.unmatchedStores.length}
              tone={preview.unmatchedStores.length ? "warning" : undefined}
            />
          </div>

          {preview.unmatchedStores.length > 0 && (
            <div className="mt-4 space-y-2">
              {preview.unmatchedStores.map((u) => (
                <MappingRow
                  key={u.name}
                  raw={u.name}
                  rowCount={u.rowCount}
                  options={stores}
                  value={storeMappings[u.name] ?? null}
                  onChange={(id) => setStoreMappings((m) => ({ ...m, [u.name]: id ?? "" }))}
                />
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-end border-t border-border pt-3">
            <Button disabled={!canImport} onClick={handleApply}>
              Confirm &amp; import {preview.totalCount} rows
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ==================== page ====================

export function ImportClient({ stores }: { stores: NameOption[] }) {
  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contest Impact data sources</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each sheet links independently — upload whichever ones you have, whenever they&apos;re ready.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <SourceImportCard<CampaignSourceRow>
          title="Campaign Data — drives grouping"
          description="One row per store, per campaign, per week. Status decides Approved / Configured, Not Approved / Not Configured."
          headers={["Month", "Week", "Store Name", "Campaign Name", "Status"]}
          stores={stores}
          parseRows={parseCampaignRows}
          validateAction={validateCampaignImport}
          applyAction={applyCampaignImport}
        />
        <SourceImportCard<InventorySourceRow>
          title="Inventory Data"
          description="One row per store, per SKU, per day. Day supplies the month and week — a separate Week column isn't needed."
          headers={["Month", "Day", "Store Name", "Campaign Name", "SKU Name", "Target Store Stock", "In Store Stock", "In Warehouse Stock"]}
          stores={stores}
          parseRows={parseInventoryRows}
          validateAction={validateInventoryImport}
          applyAction={applyInventoryImport}
        />
        <SourceImportCard<SellSideSourceRow>
          title="Sell Side Data"
          description="One row per store, per campaign, per week — GMV, penetration, average unit, category contribution."
          headers={[
            "month",
            "week_of_month",
            "execution_brand",
            "store_name",
            "this_month_gmv",
            "last_month_gmv",
            "last_year_gmv",
            "this_month_customer_penetration",
            "last_month_customer_penetration",
            "last_year_customer_penetration",
            "this_month_avg_unit",
            "last_month_avg_unit",
            "last_year_avg_unit",
            "this_month_category_contribution",
            "last_month_category_contribution",
            "last_year_category_contribution",
            "in_store_value",
          ]}
          stores={stores}
          parseRows={parseSellSideRows}
          validateAction={validateSellSideImport}
          applyAction={applySellSideImport}
        />
      </div>
    </div>
  );
}
