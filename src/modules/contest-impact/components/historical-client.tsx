"use client";

import { useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { SelectSearch } from "@/core/ui/select-search";
import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";
import { validateHistoricalImport, applyHistoricalImport } from "../actions";
import { parseCsv, normalizeHeader } from "../csv";
import type { HistoricalRow, HistoricalPreviewRow, NameOption } from "../types";

const HEADER_ALIASES: Record<string, string> = {
  campaign: "campaignName",
  campaign_name: "campaignName",
  store: "storeName",
  store_name: "storeName",
  store_code: "storeName",
  week_start: "weekStart",
  start: "weekStart",
  week_end: "weekEnd",
  end: "weekEnd",
  verdict: "verdict",
};

function rowsFromCsv(text: string): { rows: HistoricalRow[]; error: string | null } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: "No data rows found." };
  const header = table[0].map(normalizeHeader);
  const fieldIndex = new Map<string, number>();
  header.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key) fieldIndex.set(key, i);
  });
  const required = ["campaignName", "storeName", "weekStart", "weekEnd", "verdict"];
  const missing = required.filter((k) => !fieldIndex.has(k));
  if (missing.length) return { rows: [], error: `Missing column(s): ${missing.join(", ")}` };

  const get = (r: string[], key: string) => {
    const i = fieldIndex.get(key);
    return i == null ? "" : (r[i] ?? "");
  };

  const rows: HistoricalRow[] = table
    .slice(1)
    .map((r) => ({
      campaignName: get(r, "campaignName").trim(),
      storeName: get(r, "storeName").trim(),
      weekStart: get(r, "weekStart").trim(),
      weekEnd: get(r, "weekEnd").trim(),
      verdict: get(r, "verdict").trim().toLowerCase() as HistoricalRow["verdict"],
    }))
    .filter((r) => r.campaignName && r.storeName);

  return { rows, error: null };
}

export function HistoricalClient({ stores }: { stores: NameOption[] }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<HistoricalPreviewRow[] | null>(null);
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
      setPreview(null);
      if (!error && parsed.length) {
        startTransition(async () => {
          const { preview: p } = await validateHistoricalImport(parsed);
          setPreview(p);
        });
      }
    };
    reader.readAsText(file);
  }

  function isImportable(p: HistoricalPreviewRow): boolean {
    if (p.ok) return true;
    return p.error === "store not found" && !!storeMappings[p.raw.storeName];
  }

  function handleApply() {
    if (!preview) return;
    const importable = preview.filter(isImportable).map((p) => p.raw);
    startTransition(async () => {
      const res = await applyHistoricalImport(importable, storeMappings);
      setResult(res.error ? `Error: ${res.error}` : `Created ${res.created} task record(s).`);
      if (!res.error) {
        setPreview(null);
        setFileName(null);
        setStoreMappings({});
      }
    });
  }

  const unresolved = (preview ?? []).filter((p) => p.error === "store not found");
  const otherErrors = (preview ?? []).filter((p) => !p.ok && p.error !== "store not found");
  const importableCount = (preview ?? []).filter(isImportable).length;

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Historical backfill</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import contests that ran before Vero existed, using verdicts you already have on record.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Upload CSV</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Columns: campaign name, store name, week start, week end, verdict (approved / rejected / missed). A
          campaign name that doesn&apos;t already exist in Vero is created automatically, sized to the date range
          of the rows referencing it.
        </p>
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

      {parseError && <p className="mt-4 text-sm text-danger">{parseError}</p>}
      {result && <p className="mt-4 text-sm font-medium text-foreground">{result}</p>}

      {preview && (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <Stat label="rows read" value={preview.length} />
            <Stat label="ready to import" value={importableCount} tone="success" />
            <Stat label="stores need mapping" value={unresolved.length} tone={unresolved.length ? "warning" : undefined} />
            {otherErrors.length > 0 && <Stat label="rows with errors" value={otherErrors.length} tone="warning" />}
          </div>

          {unresolved.length > 0 && (
            <div className="mt-6">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Unmatched store names
              </p>
              <div className="mt-2 space-y-2">
                {[...new Set(unresolved.map((p) => p.raw.storeName))].map((name) => (
                  <div key={name} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
                    <span className="rounded-lg bg-danger/10 px-2 py-1 font-mono text-xs text-danger">&quot;{name}&quot;</span>
                    <span className="text-muted-foreground">→</span>
                    <div className="min-w-56 flex-1">
                      <SelectSearch
                        options={stores}
                        value={storeMappings[name] ?? null}
                        onChange={(id) => setStoreMappings((m) => ({ ...m, [name]: id ?? "" }))}
                        placeholder="Map to…"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {otherErrors.length > 0 && (
            <div className="mt-6 rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
              {otherErrors.length} row(s) skipped — bad dates or verdict:{" "}
              {otherErrors
                .slice(0, 5)
                .map((p) => `${p.raw.storeName} (${p.error})`)
                .join(", ")}
              {otherErrors.length > 5 ? "…" : ""}
            </div>
          )}

          <div className="mt-6 flex justify-end border-t border-border pt-4">
            <Button disabled={isPending || importableCount === 0} onClick={handleApply}>
              Import {importableCount} row{importableCount === 1 ? "" : "s"}
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
