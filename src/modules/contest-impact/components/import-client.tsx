"use client";

import { useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { SelectSearch } from "@/core/ui/select-search";
import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";
import { validateImport, applyImport } from "../actions";
import { parseCsv, normalizeHeader } from "../csv";
import type { ImportSourceRow, ImportPreview, NameOption } from "../types";

const HEADER_ALIASES: Record<string, string> = {
  month: "month",
  week_of_month: "weekOfMonth",
  week: "weekOfMonth",
  execution_brand: "campaignName",
  campaign: "campaignName",
  campaign_name: "campaignName",
  brand_campaign: "campaignName",
  store_name: "storeName",
  store: "storeName",
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

function parseNumber(cell: string): number | null {
  const cleaned = cell.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseMonth(cell: string): string | null {
  const c = cell.trim();
  if (/^\d{4}-\d{2}$/.test(c)) return c;
  if (/^\d{4}-\d{2}-\d{2}$/.test(c)) return c.slice(0, 7);
  const d = new Date(c);
  if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return null;
}

function rowsFromCsv(text: string): { rows: ImportSourceRow[]; error: string | null } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: "No data rows found." };
  const header = table[0].map(normalizeHeader);
  const fieldIndex = new Map<string, number>();
  header.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key) fieldIndex.set(key, i);
  });
  const required = ["month", "weekOfMonth", "campaignName", "storeName"];
  const missing = required.filter((k) => !fieldIndex.has(k));
  if (missing.length) return { rows: [], error: `Missing column(s): ${missing.join(", ")}` };

  const get = (r: string[], key: string) => {
    const i = fieldIndex.get(key);
    return i == null ? "" : (r[i] ?? "");
  };

  const rows: ImportSourceRow[] = table
    .slice(1)
    .map((r) => ({
      month: parseMonth(get(r, "month")) ?? "",
      weekOfMonth: Number(get(r, "weekOfMonth")) || 0,
      campaignName: get(r, "campaignName").trim(),
      storeName: get(r, "storeName").trim(),
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
    }))
    .filter((r) => r.storeName && r.campaignName && r.month && r.weekOfMonth);

  return { rows, error: null };
}

export function ImportClient({ campaigns, stores }: { campaigns: NameOption[]; stores: NameOption[] }) {
  const [rows, setRows] = useState<ImportSourceRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [campaignMappings, setCampaignMappings] = useState<Record<string, string>>({});
  const [storeMappings, setStoreMappings] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const { rows: parsed, error } = rowsFromCsv(text);
      setParseError(error);
      setRows(parsed);
      setPreview(null);
      if (!error && parsed.length) {
        startTransition(async () => {
          const p = await validateImport(parsed);
          setPreview(p);
        });
      }
    };
    reader.readAsText(file);
  }

  function handleApply() {
    startTransition(async () => {
      const res = await applyImport(rows, { campaigns: campaignMappings, stores: storeMappings });
      setResult(res.error ? `Error: ${res.error}` : `Imported ${res.imported} rows.`);
      if (!res.error) {
        setRows([]);
        setPreview(null);
        setFileName(null);
        setCampaignMappings({});
        setStoreMappings({});
      }
    });
  }

  const canImport =
    !isPending &&
    preview != null &&
    rows.length > 0 &&
    preview.unmatchedCampaigns.every((u) => campaignMappings[u.name]) &&
    preview.unmatchedStores.every((u) => storeMappings[u.name]);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Import weekly performance data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Export the week&apos;s sheet as CSV and upload it here — matches every row to a Vero campaign and store.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 opacity-55">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            Connect Google Sheet
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Phase 2
            </span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Paste a sheet URL once it&apos;s shared with Vero&apos;s service account. Syncs on a schedule or on demand.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Upload CSV</h3>
          <p className="mt-1 text-xs text-muted-foreground">Works today — no setup required.</p>
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-input px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
            <Upload className="h-4 w-4" />
            {fileName ?? "Choose a CSV file…"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
        </div>
      </div>

      {parseError && <p className="mt-4 text-sm text-danger">{parseError}</p>}
      {result && <p className="mt-4 text-sm font-medium text-foreground">{result}</p>}

      {preview && (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <Stat label="rows read" value={preview.totalCount} />
            <Stat label="matched cleanly" value={preview.matchedCount} tone="success" />
            <Stat label="stores need mapping" value={preview.unmatchedStores.length} tone={preview.unmatchedStores.length ? "warning" : undefined} />
            <Stat label="campaigns need mapping" value={preview.unmatchedCampaigns.length} tone={preview.unmatchedCampaigns.length ? "warning" : undefined} />
          </div>

          {preview.unmatchedCampaigns.length > 0 && (
            <div className="mt-6">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Unmatched campaign names ({preview.unmatchedCampaigns.length})
              </p>
              <p className="mb-2 mt-1 text-xs text-muted-foreground">Map each once — remembered for every future import.</p>
              <div className="space-y-2">
                {preview.unmatchedCampaigns.map((u) => (
                  <MappingRow
                    key={u.name}
                    raw={u.name}
                    rowCount={u.rowCount}
                    options={campaigns}
                    value={campaignMappings[u.name] ?? null}
                    onChange={(id) => setCampaignMappings((m) => ({ ...m, [u.name]: id ?? "" }))}
                  />
                ))}
              </div>
            </div>
          )}

          {preview.unmatchedStores.length > 0 && (
            <div className="mt-6">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Unmatched store names ({preview.unmatchedStores.length})
              </p>
              <p className="mb-2 mt-1 text-xs text-muted-foreground">Map each once — remembered for every future import.</p>
              <div className="space-y-2">
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
            </div>
          )}

          <div className="mt-6 flex justify-end border-t border-border pt-4">
            <Button disabled={!canImport} onClick={handleApply}>
              Confirm mappings &amp; import {preview.totalCount} rows
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

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
