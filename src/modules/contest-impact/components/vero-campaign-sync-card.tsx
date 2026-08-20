"use client";

import { useState, useTransition } from "react";
import { SelectSearch } from "@/core/ui/select-search";
import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";
import { previewVeroCampaignSync, syncVeroCampaignData } from "../actions";
import type { VeroCampaignSyncPreview } from "../queries";
import type { VeroCampaignOption } from "../queries";

export function VeroCampaignSyncCard({ campaigns }: { campaigns: VeroCampaignOption[] }) {
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [preview, setPreview] = useState<VeroCampaignSyncPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, boolean | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const campaignOptions = campaigns.map((c) => ({ id: c.id, label: c.name }));

  function loadPreview() {
    if (!campaignId) return;
    setError(null);
    setResult(null);
    setPreview(null);
    startTransition(async () => {
      const p = await previewVeroCampaignSync(campaignId, month);
      if (!p.rows.length) {
        setError("No reviewed submissions found for this campaign and month.");
        return;
      }
      setPreview(p);
      setChoices(Object.fromEntries(p.statuses.map((s) => [s.status, s.isApproved])));
    });
  }

  function sync() {
    if (!campaignId || !preview) return;
    setError(null);
    startTransition(async () => {
      const res = await syncVeroCampaignData(
        campaignId,
        month,
        preview.statuses.map((s) => ({ rawStatus: s.status, isApproved: choices[s.status]! })),
      );
      if (res.error) setError(res.error);
      else {
        setResult(`Synced ${res.imported} row(s) from ${preview.campaignName}.`);
        setPreview(null);
        setChoices({});
      }
    });
  }

  const storeCount = preview ? new Set(preview.rows.map((r) => r.storeId)).size : 0;
  const weekCount = preview ? new Set(preview.rows.map((r) => r.week)).size : 0;
  const allChosen = preview ? preview.statuses.every((s) => choices[s.status] !== null) : false;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Campaign Data — sync from a Vero campaign</h3>
      <p className="mt-1 max-w-xl text-xs text-muted-foreground">
        An alternative to the CSV upload above — pulls week-by-week store verdicts straight from a real Vero
        campaign&apos;s own task reviews, using each submission&apos;s payout tier (or approve/reject) as the status.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
        <SelectSearch
          options={campaignOptions}
          value={campaignId}
          onChange={(id) => {
            setCampaignId(id);
            setPreview(null);
            setResult(null);
            setError(null);
          }}
          placeholder="Pick a Vero campaign…"
          emptyText="No campaigns found"
        />
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl border border-transparent bg-input px-3 py-2.5 text-sm text-foreground focus:border-primary focus:bg-card focus:outline-none"
        />
        <Button variant="outline" size="md" onClick={loadPreview} disabled={!campaignId || isPending}>
          Preview
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {result && <p className="mt-3 text-sm font-medium text-foreground">{result}</p>}

      {preview && (
        <>
          <div className="mt-4 flex flex-wrap gap-3">
            <div className="min-w-32 flex-1 rounded-xl border border-border bg-card px-4 py-2.5">
              <div className="text-xl font-bold tabular-nums text-foreground">{preview.rows.length}</div>
              <div className="text-[11px] text-muted-foreground">reviewed store-weeks</div>
            </div>
            <div className="min-w-32 flex-1 rounded-xl border border-border bg-card px-4 py-2.5">
              <div className="text-xl font-bold tabular-nums text-foreground">{storeCount}</div>
              <div className="text-[11px] text-muted-foreground">stores</div>
            </div>
            <div className="min-w-32 flex-1 rounded-xl border border-border bg-card px-4 py-2.5">
              <div className="text-xl font-bold tabular-nums text-foreground">{weekCount}</div>
              <div className="text-[11px] text-muted-foreground">weeks</div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Map each verdict found in this campaign&apos;s reviews to approved or poor execution:
            </p>
            {preview.statuses.map(({ status }) => (
              <div key={status} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                <span className="rounded-lg bg-muted px-2 py-1 font-mono text-xs text-foreground">&quot;{status}&quot;</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setChoices((c) => ({ ...c, [status]: true }))}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      choices[status] === true
                        ? "border-success bg-success/10 text-success"
                        : "border-border text-muted-foreground hover:border-success/50",
                    )}
                  >
                    Approved execution
                  </button>
                  <button
                    type="button"
                    onClick={() => setChoices((c) => ({ ...c, [status]: false }))}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      choices[status] === false
                        ? "border-danger bg-danger/10 text-danger"
                        : "border-border text-muted-foreground hover:border-danger/50",
                    )}
                  >
                    Poor execution
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end border-t border-border pt-3">
            <Button disabled={!allChosen || isPending} onClick={sync}>
              Sync {preview.rows.length} rows to Contest Impact
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
