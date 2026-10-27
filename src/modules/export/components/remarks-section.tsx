"use client";

import { useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/core/ui/button";
import { MultiSelect } from "@/core/ui/multi-select";
import { cn } from "@/core/lib/utils";
import { fetchRemarks } from "../actions";
import { downloadCsv } from "./csv";
import type { CampaignOption, RemarkRow } from "../types";

const PREVIEW_ROWS = 8;

function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  return { start: `${month}-01`, end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

/** What the field team flagged — "Can't do it" reasons and photo comments — as a
 * downloadable list, so stock gaps can be reviewed and pushed. Starts on the
 * page's month; changing the dates fetches that range. Has its own campaign
 * filter, separate from the one at the top of the page. */
export function RemarksSection({ month, initialRows, campaigns }: { month: string; initialRows: RemarkRow[]; campaigns: CampaignOption[] }) {
  const bounds = monthBounds(month);
  const [from, setFrom] = useState(bounds.start);
  const [to, setTo] = useState(bounds.end);
  const [rows, setRows] = useState(initialRows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [stockOnly, setStockOnly] = useState(false);
  const [remark, setRemark] = useState("");

  // Only the latest request may update the list — dates can change while one is in flight.
  const latest = useRef(0);

  async function changeRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    if (!nextFrom || !nextTo) return;
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    const res = await fetchRemarks(nextFrom, nextTo);
    if (id !== latest.current) return;
    setLoading(false);
    if (res.error) setError(res.error);
    else {
      setRows(res.rows ?? []);
      setRemark("");
    }
  }

  const campaignRows = useMemo(() => (campaignIds.length ? rows.filter((r) => campaignIds.includes(r.campaignId)) : rows), [rows, campaignIds]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of campaignRows) m.set(r.remark.toLowerCase(), (m.get(r.remark.toLowerCase()) ?? 0) + 1);
    return m;
  }, [campaignRows]);

  // Free-text comments are all different, so only offer the repeated reasons as filters.
  const reasonOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of campaignRows) if (r.source === "Can't do it") seen.set(r.remark.toLowerCase(), r.remark);
    return [...seen.entries()].map(([k, label]) => ({ k, label, n: counts.get(k) ?? 0 })).sort((a, b) => b.n - a.n);
  }, [campaignRows, counts]);

  // Campaign filter first, so the stock count and reason list follow it.
  const shown = campaignRows.filter((r) => (!stockOnly || r.isStockIssue) && (!remark || r.remark.toLowerCase() === remark));
  const stockCount = campaignRows.filter((r) => r.isStockIssue).length;
  const stores = new Set(shown.map((r) => r.storeCode)).size;

  function exportCsv() {
    downloadCsv(
      `remarks-${from}-to-${to}${stockOnly ? "-stock" : ""}.csv`,
      ["Date", "StoreCode", "StoreName", "Campaign", "Source", "Remark", "StockIssue", "ReportedBy"],
      shown.map((r) => [r.date, r.storeCode, r.storeName, r.campaignName, r.source, r.remark, r.isStockIssue ? "Yes" : "No", r.reportedBy]),
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Field remarks</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Every &quot;Can&apos;t do it&quot; reason and photo comment the field team (SAEs, ASMs, store staff) left this month, one row per remark. Filter to stock issues
        and download the list to see where stock needs pushing.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">From</label>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => changeRange(e.target.value, to)}
            className="h-10 w-full rounded-xl border border-transparent bg-input px-2 text-sm text-foreground focus:border-primary focus:bg-background focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">To</label>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => changeRange(from, e.target.value)}
            className="h-10 w-full rounded-xl border border-transparent bg-input px-2 text-sm text-foreground focus:border-primary focus:bg-background focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">Campaigns</label>
          <MultiSelect
            options={campaigns.map((c) => ({ id: c.id, label: c.name }))}
            selected={campaignIds}
            onChange={setCampaignIds}
            placeholder="All campaigns"
          />
        </div>
      </div>
      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStockOnly((v) => !v)}
          aria-pressed={stockOnly}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            stockOnly ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:border-primary",
          )}
        >
          Stock issues only ({stockCount})
        </button>
        <select
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          className="h-8 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
        >
          <option value="">All &quot;Can&apos;t do it&quot; reasons</option>
          {reasonOptions.map((o) => (
            <option key={o.k} value={o.k}>{o.label} ({o.n})</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {loading ? "Loading…" : `${shown.length} remark${shown.length === 1 ? "" : "s"} · ${stores} store${stores === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-semibold">Date</th>
              <th className="px-4 py-2.5 text-left font-semibold">Store</th>
              <th className="px-4 py-2.5 text-left font-semibold">Campaign</th>
              <th className="px-4 py-2.5 text-left font-semibold">Remark</th>
              <th className="px-4 py-2.5 text-left font-semibold">Reported by</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No remarks in this selection.</td>
              </tr>
            )}
            {shown.slice(0, PREVIEW_ROWS).map((r) => (
              <tr key={r.key} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">{r.date}</td>
                <td className="px-4 py-2.5 font-medium text-foreground">{r.storeName}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.campaignName}</td>
                <td className="px-4 py-2.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", r.isStockIssue ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground")}>
                    {r.remark}
                  </span>
                  <span className="ml-1.5 text-[11px] text-muted-foreground">{r.source === "Photo comment" ? "photo comment" : ""}</span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.reportedBy || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {shown.length > PREVIEW_ROWS ? `Showing ${PREVIEW_ROWS} of ${shown.length} — the CSV has all of them. ` : ""}
          For &quot;Can&apos;t do it&quot; rows, Vero doesn&apos;t record who tapped it, so it lists the store&apos;s SAE/ASM.
        </p>
        <Button variant="outline" onClick={exportCsv} disabled={loading || shown.length === 0}>
          <Download className="h-4 w-4" /> Export remarks CSV
        </Button>
      </div>
    </section>
  );
}
