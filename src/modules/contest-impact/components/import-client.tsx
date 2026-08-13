"use client";

import { useState, useTransition } from "react";
import { Upload, Download } from "lucide-react";
import { SelectSearch } from "@/core/ui/select-search";
import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";
import { parseCsv } from "../csv";
import { mapCampaignRows, mapInventoryRows, mapSellSideRows } from "../rows";
import {
  validateCampaignImport,
  applyCampaignImport,
  validateInventoryImport,
  applyInventoryImport,
  validateSellSideImport,
  applySellSideImport,
} from "../actions";
import {
  generateCampaignStatusTemplate,
  generateInventoryTemplate,
  generateSellSideTemplate,
} from "../template";
import {
  previewCampaignSheetSync,
  previewInventorySheetSync,
  previewSellSideSheetSync,
  saveSheetConfig,
} from "../sync";
import type { SheetConfig } from "../sync";
import type {
  CampaignSourceRow,
  InventorySourceRow,
  SellSideSourceRow,
  NameOption,
  CampaignOption,
  UnmatchedName,
  UnknownSku,
} from "../types";

type Preview = {
  unmatchedStores: UnmatchedName[];
  unknownSkus: UnknownSku[];
  matchedCount: number;
  totalCount: number;
};

// ==================== per-source parsers ====================
// Header aliases and row mapping live in ../rows — shared with the Google
// Sheets pull, so the two input paths can never validate differently.

function parseCampaignRows(text: string): { rows: CampaignSourceRow[]; error: string | null } {
  return mapCampaignRows(parseCsv(text));
}

function parseInventoryRows(text: string): { rows: InventorySourceRow[]; error: string | null } {
  return mapInventoryRows(parseCsv(text));
}

function parseSellSideRows(text: string): { rows: SellSideSourceRow[]; error: string | null } {
  return mapSellSideRows(parseCsv(text));
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
  syncAction,
}: {
  title: string;
  description: string;
  headers: string[];
  stores: NameOption[];
  parseRows: (text: string) => { rows: T[]; error: string | null };
  validateAction: (rows: T[]) => Promise<Preview>;
  applyAction: (rows: T[], mappings: Record<string, string>) => Promise<{ error?: string; imported?: number }>;
  /** Pulls rows from the connected Google Sheet tab instead of a pasted/uploaded
   * CSV. Feeds the exact same preview/validate/confirm flow below — a bad
   * pull is caught before anything touches the database, same as a bad CSV. */
  syncAction?: () => Promise<{ rows: T[]; error: string | null }>;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<T[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [storeMappings, setStoreMappings] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);

  function handleParsed(parsed: T[], error: string | null) {
    // Zero rows with no error would otherwise render nothing at all — silent
    // in a way that looks identical to "nothing happened yet" rather than
    // "this ran and found nothing usable."
    setParseError(error ?? (parsed.length === 0 ? "No usable rows found — check the required columns are filled in." : null));
    setRows(parsed);
    setPreview(null);
    if (!error && parsed.length) {
      startTransition(async () => {
        const p = await validateAction(parsed);
        setPreview(p);
      });
    }
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const { rows: parsed, error } = parseRows(text);
      handleParsed(parsed, error);
    };
    reader.readAsText(file);
  }

  function handleSync() {
    if (!syncAction) return;
    setFileName(null);
    setResult(null);
    setIsSyncing(true);
    (async () => {
      const { rows: parsed, error } = await syncAction();
      setIsSyncing(false);
      handleParsed(parsed, error);
    })();
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

  // Unknown SKUs need no mapping decision — they're excluded automatically
  // (see checkSkus in actions.ts) and only shown so the cause is visible.
  const canImport =
    !isPending &&
    preview != null &&
    preview.matchedCount > 0 &&
    preview.unmatchedStores.every((u) => storeMappings[u.name]);

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
        <div className="rounded-xl border border-border p-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Google Sheet</p>
          {syncAction ? (
            <Button variant="outline" size="md" disabled={isSyncing} onClick={handleSync} className="w-full">
              {isSyncing ? "Pulling…" : "Pull latest from Google Sheet"}
            </Button>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-input px-3 py-2 text-xs text-muted-foreground">
              Not connected — add a Spreadsheet ID above first.
            </p>
          )}
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
        </div>
      </div>

      {parseError && <p className="mt-3 text-sm text-danger">{parseError}</p>}
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
            {preview.unknownSkus.length > 0 && (
              <Stat label="unknown SKU codes" value={preview.unknownSkus.length} tone="warning" />
            )}
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

          {preview.unknownSkus.length > 0 && (
            <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3">
              <p className="text-xs font-medium text-warning">
                These SKU codes aren&apos;t in the matching campaign&apos;s SKU list — their rows will be skipped.
                Add the SKU in Setup, or fix the code and re-upload.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {preview.unknownSkus.map((u) => (
                  <span key={u.code} className="rounded-md bg-card px-2 py-0.5 font-mono text-[11px] text-foreground">
                    {u.code || "(blank)"} · {u.rowCount} row{u.rowCount === 1 ? "" : "s"}
                  </span>
                ))}
              </div>
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

// ==================== template downloads ====================

type TemplateAction = (
  campaignKey: string,
  campaignLabel: string,
  month: string,
) => Promise<{ csv?: string; rowCount?: number; error?: string }>;

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ==================== Google Sheet connection ====================

function GoogleSheetConnection({ config }: { config: SheetConfig }) {
  const [urlOrId, setUrlOrId] = useState(config.spreadsheetId ?? "");
  const [tabCampaign, setTabCampaign] = useState(config.tabCampaign);
  const [tabInventory, setTabInventory] = useState(config.tabInventory);
  const [tabSellSide, setTabSellSide] = useState(config.tabSellSide);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setSaved(null);
    setError(null);
    startTransition(async () => {
      const res = await saveSheetConfig({
        spreadsheetUrlOrId: urlOrId,
        tabCampaign,
        tabInventory,
        tabSellSide,
      });
      if (res.error) setError(res.error);
      else setSaved("Saved. The pull buttons below will use this from now on.");
    });
  }

  const inputClass = "w-full rounded-lg border border-border bg-input px-2.5 py-1.5 text-sm text-foreground";
  const labelClass = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Google Sheet connection</h3>
      <p className="mt-1 max-w-xl text-xs text-muted-foreground">
        One spreadsheet, three tabs — this is where the &quot;Pull from Google Sheet&quot; buttons below read from.
        Whoever owns the Metabase/BigQuery export needs to share the spreadsheet with the service account before
        a pull will work.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className={labelClass}>Spreadsheet URL or ID</label>
          <input
            value={urlOrId}
            onChange={(e) => setUrlOrId(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Campaign status tab</label>
            <input value={tabCampaign} onChange={(e) => setTabCampaign(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Inventory tab</label>
            <input value={tabInventory} onChange={(e) => setTabInventory(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Sell-side tab</label>
            <input value={tabSellSide} onChange={(e) => setTabSellSide(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {saved && !error && <p className="mt-3 text-sm font-medium text-success">{saved}</p>}

      <div className="mt-4 flex justify-end">
        <Button disabled={isPending || !urlOrId.trim()} onClick={handleSave}>
          {isPending ? "Saving…" : "Save connection"}
        </Button>
      </div>
    </div>
  );
}

function TemplateDownloads({ contests }: { contests: CampaignOption[] }) {
  const [campaignKey, setCampaignKey] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const contest = contests.find((c) => c.key === campaignKey) ?? null;

  function handleDownload(kind: string, action: TemplateAction, filenamePrefix: string) {
    if (!contest) {
      setError("Pick a contest first.");
      return;
    }
    setError(null);
    setPending(kind);
    startTransition(async () => {
      const res = await action(contest.key, contest.label, month);
      setPending(null);
      if (res.error || !res.csv) {
        setError(res.error ?? "Could not generate the template.");
        return;
      }
      downloadCsv(`${filenamePrefix}_${contest.label.replace(/\s+/g, "_")}_${month}.csv`, res.csv);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Download a template</h3>
      <p className="mt-1 max-w-xl text-xs text-muted-foreground">
        Pre-keyed with the right store names, SKU codes and dates for the contest and month you pick — you only
        type numbers into the blank columns. Inventory and sell-side templates start 4 weeks before the month you
        pick, so the report has a pre-contest period to compare against.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Contest
          </label>
          <SelectSearch
            options={contests.map((c) => ({ id: c.key, label: c.label }))}
            value={campaignKey}
            onChange={setCampaignKey}
            placeholder="Pick a contest…"
            emptyText="No campaigns found — create one first"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Month
          </label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-border bg-input px-2.5 py-1.5 text-sm text-foreground"
          />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="md"
          disabled={isPending}
          onClick={() => handleDownload("status", generateCampaignStatusTemplate, "campaign_status")}
        >
          <Download className="h-3.5 w-3.5" />
          {pending === "status" ? "Preparing…" : "Campaign status"}
        </Button>
        <Button
          variant="outline"
          size="md"
          disabled={isPending}
          onClick={() => handleDownload("inventory", generateInventoryTemplate, "inventory")}
        >
          <Download className="h-3.5 w-3.5" />
          {pending === "inventory" ? "Preparing…" : "Inventory"}
        </Button>
        <Button
          variant="outline"
          size="md"
          disabled={isPending}
          onClick={() => handleDownload("sell_side", generateSellSideTemplate, "sell_side")}
        >
          <Download className="h-3.5 w-3.5" />
          {pending === "sell_side" ? "Preparing…" : "Sell-side"}
        </Button>
      </div>
    </div>
  );
}

// ==================== page ====================

export function ImportClient({
  stores,
  contests,
  sheetConfig,
}: {
  stores: NameOption[];
  contests: CampaignOption[];
  sheetConfig: SheetConfig;
}) {
  const connected = Boolean(sheetConfig.spreadsheetId);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contest Impact data sources</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each sheet links independently — upload whichever ones you have, whenever they&apos;re ready.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <GoogleSheetConnection config={sheetConfig} />
        <TemplateDownloads contests={contests} />

        <SourceImportCard<CampaignSourceRow>
          title="Campaign Data — drives grouping"
          description="One row per store, per day. Status decides Approved / Configured, Not Approved / Not Configured."
          headers={["date", "store_name", "campaign_name", "status"]}
          stores={stores}
          parseRows={parseCampaignRows}
          validateAction={validateCampaignImport}
          applyAction={applyCampaignImport}
          syncAction={connected ? previewCampaignSheetSync : undefined}
        />
        <SourceImportCard<InventorySourceRow>
          title="Inventory Data"
          description="One row per store, per SKU, per day — target vs. actual stock, store and warehouse. sku_code must match the SKU list set up for that campaign."
          headers={["date", "store_name", "campaign_name", "sku_code", "sku_name", "target_store_stock", "in_store_stock", "target_warehouse_stock", "in_warehouse_stock"]}
          stores={stores}
          parseRows={parseInventoryRows}
          validateAction={validateInventoryImport}
          applyAction={applyInventoryImport}
          syncAction={connected ? previewInventorySheetSync : undefined}
        />
        <SourceImportCard<SellSideSourceRow>
          title="Sell Side Data"
          description="One row per store, per SKU, per day — units, GMV, penetration, average unit, category contribution, each vs. the same date last month and last year."
          headers={[
            "date",
            "store_name",
            "campaign_name",
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
          ]}
          stores={stores}
          parseRows={parseSellSideRows}
          validateAction={validateSellSideImport}
          applyAction={applySellSideImport}
          syncAction={connected ? previewSellSideSheetSync : undefined}
        />
      </div>
    </div>
  );
}
